'use server';

import { z } from 'zod';
import { env } from '@relay/config';
import {
  clock,
  ConflictError,
  DEFAULT_ACCESS_CHECKLIST,
  renderIntroductionEmail,
  ValidationError,
} from '@relay/core';
import { db, transaction } from '@relay/db';
import { integrations } from '@relay/integrations';
import { actionOk, defineAction } from '@/server/action';
import { audit, notify, recordActivity } from '@/server/record';
import {
  fanOut,
  moveStage,
  nudgeWorker,
  recomputeHealth,
  resolveProject,
  revalidateProject,
} from '@/features/projects/mutations';

/**
 * The automated merchant introduction. SHOPLINE picks the contact and presses
 * one button; the body is generated from the project record so two account
 * managers cannot introduce the same product two different ways.
 */
async function buildIntroduction(projectId: string) {
  const project = await db.project.findUniqueOrThrow({
    where: { id: projectId },
    select: {
      code: true,
      migrationType: true,
      targetLaunchDate: true,
      merchant: {
        select: {
          name: true,
          website: true,
          shoplineStoreId: true,
          currentPlatform: true,
          contacts: {
            select: { name: true, email: true, isPrimary: true },
            orderBy: { isPrimary: 'desc' },
          },
        },
      },
      ahnProjectManager: { select: { name: true, email: true } },
      shoplineAm: { select: { name: true, email: true } },
      accessItems: {
        where: { blocking: true },
        select: { label: true },
        orderBy: { sortOrder: 'asc' },
      },
    },
  });

  const contact = project.merchant.contacts[0];
  if (!contact) {
    throw new ValidationError('This merchant has no contact yet.', {
      contact: ['Add a primary contact before sending the introduction.'],
    });
  }
  if (!project.shoplineAm) {
    throw new ValidationError('No SHOPLINE account manager is assigned.', {
      shoplineAm: ['Assign a SHOPLINE account manager first - they are the sender.'],
    });
  }
  if (!project.ahnProjectManager) {
    throw new ValidationError('No AHN project manager is assigned.', {
      ahnPm: ['Assign an AHN project manager - the merchant needs somebody to reply to.'],
    });
  }

  const rendered = renderIntroductionEmail({
    merchantName: project.merchant.name,
    merchantContactName: contact.name,
    merchantWebsite: project.merchant.website,
    currentPlatform: project.merchant.currentPlatform,
    shoplineStoreId: project.merchant.shoplineStoreId,
    migrationType: project.migrationType,
    targetLaunchDate: project.targetLaunchDate,
    shoplineContactName: project.shoplineAm.name,
    shoplineContactEmail: project.shoplineAm.email,
    ahnContactName: project.ahnProjectManager.name,
    ahnContactEmail: project.ahnProjectManager.email,
    projectUrl: `${env().APP_URL}/projects/${project.code}`,
    requiredAccess:
      project.accessItems.length > 0
        ? project.accessItems.map((item) => item.label)
        : DEFAULT_ACCESS_CHECKLIST.filter((item) => item.blocking).map((item) => item.label),
  });

  return {
    rendered,
    contacts: project.merchant.contacts.map((c) => ({ name: c.name, email: c.email })),
    ahn: project.ahnProjectManager,
    shopline: project.shoplineAm,
    merchantName: project.merchant.name,
  };
}

/** Renders the draft for the preview, without sending anything. */
export const previewIntroductionAction = defineAction({
  name: 'introduction.preview',
  permission: 'introduction:send',
  input: z.object({ code: z.string().min(1) }),
  async handler(input, ctx) {
    const project = await resolveProject(ctx.principal, input.code);
    const draft = await buildIntroduction(project.id);
    return actionOk({
      subject: draft.rendered.subject,
      text: draft.rendered.text,
      recipients: draft.contacts,
      cc: [draft.ahn, draft.shopline],
    });
  },
});

export const sendIntroductionAction = defineAction({
  name: 'introduction.send',
  permission: 'introduction:send',
  input: z.object({
    code: z.string().min(1),
    /** Optional override; the generated body is used when absent. */
    note: z.string().trim().max(2000).optional(),
  }),
  async handler(input, ctx) {
    const project = await resolveProject(ctx.principal, input.code);
    const draft = await buildIntroduction(project.id);

    const text = input.note ? `${draft.rendered.text}\n\n---\n${input.note}` : draft.rendered.text;

    const result = await integrations().email.send({
      to: draft.contacts,
      cc: [
        { name: draft.ahn.name, email: draft.ahn.email },
        { name: draft.shopline.name, email: draft.shopline.email },
      ],
      replyTo: { name: draft.shopline.name, email: draft.shopline.email },
      subject: draft.rendered.subject,
      text,
      html: draft.rendered.html,
    });

    if (!result.ok) {
      throw new ConflictError(
        result.error?.userMessage ?? 'The introduction could not be sent. Try again.',
      );
    }

    const now = clock.now();

    const outboxIds = await transaction(async (tx) => {
      const email = await tx.introductionEmail.create({
        data: {
          projectId: project.id,
          status: 'SENT',
          subject: draft.rendered.subject,
          bodyText: text,
          bodyHtml: draft.rendered.html,
          recipients: draft.contacts,
          sentById: ctx.principal.id,
          sentAt: now,
          providerMessageId: result.data?.messageId ?? null,
        },
        select: { id: true },
      });

      if (project.stage === 'INTRODUCTION') {
        await moveStage(tx, {
          projectId: project.id,
          to: 'MERCHANT_CONTACTED',
          changedById: ctx.principal.id,
          reason: 'Introduction email sent.',
        });
      }

      await recordActivity(tx, {
        projectId: project.id,
        type: 'INTRODUCTION_SENT',
        actorId: ctx.principal.id,
        summary: `Introduction sent to ${draft.contacts.map((c) => c.name).join(', ')}.`,
        detail: draft.rendered.subject,
        visibility: 'EVERYONE',
        payload: { introductionEmailId: email.id },
      });

      await audit(tx, {
        principal: ctx.principal,
        projectId: project.id,
        action: 'introduction.send',
        entityType: 'IntroductionEmail',
        entityId: email.id,
        after: { recipients: draft.contacts.map((c) => c.email) },
        ip: ctx.ip,
      });

      const watchers = await tx.project.findUnique({
        where: { id: project.id },
        select: { ahnProjectManagerId: true, shoplineAmId: true },
      });

      await notify(tx, {
        userIds: [watchers?.ahnProjectManagerId, watchers?.shoplineAmId].filter(
          (id): id is string => typeof id === 'string',
        ),
        projectId: project.id,
        type: 'INTRODUCTION_UNANSWERED',
        title: `Introduction sent for ${draft.merchantName}`,
        body: 'Waiting on the merchant to reply.',
        href: `/projects/${project.code}`,
        exceptUserId: ctx.principal.id,
      });

      await recomputeHealth(tx, project.id);

      return fanOut(tx, {
        projectId: project.id,
        projectCode: project.code,
        title: `Introduction sent for ${draft.merchantName}`,
        body: `Sent to ${draft.contacts.map((c) => c.email).join(', ')}. Waiting on a reply.`,
        tone: 'info',
      });
    });

    await nudgeWorker(outboxIds);
    revalidateProject(input.code);

    const mode = (await integrations().email.health()).mode;
    return actionOk(
      undefined,
      mode === 'mock'
        ? 'Introduction recorded. Email is in mock mode - add a provider key to deliver it.'
        : 'Introduction sent.',
    );
  },
});

/** Records that the merchant replied, which stops the unanswered-intro nag. */
export const recordIntroductionResponseAction = defineAction({
  name: 'introduction.record_response',
  permission: 'introduction:send',
  input: z.object({
    code: z.string().min(1),
    introductionEmailId: z.string().uuid(),
    note: z.string().trim().max(2000).optional(),
    bounced: z.boolean().default(false),
  }),
  async handler(input, ctx) {
    const project = await resolveProject(ctx.principal, input.code);
    const now = clock.now();

    await transaction(async (tx) => {
      const email = await tx.introductionEmail.findFirst({
        where: { id: input.introductionEmailId, projectId: project.id },
        select: { id: true, status: true },
      });
      if (!email) throw new ConflictError('That introduction is not on this project.');

      await tx.introductionEmail.update({
        where: { id: email.id },
        data: {
          status: input.bounced ? 'BOUNCED' : 'RESPONDED',
          respondedAt: input.bounced ? null : now,
          responseNote: input.note ?? null,
        },
      });

      await recordActivity(tx, {
        projectId: project.id,
        type: 'INTRODUCTION_RESPONSE',
        actorId: ctx.principal.id,
        summary: input.bounced
          ? 'The introduction email bounced.'
          : 'The merchant replied to the introduction.',
        detail: input.note ?? null,
        visibility: 'AHN_SHOPLINE',
      });

      await audit(tx, {
        principal: ctx.principal,
        projectId: project.id,
        action: 'introduction.record_response',
        entityType: 'IntroductionEmail',
        entityId: email.id,
        after: { status: input.bounced ? 'BOUNCED' : 'RESPONDED' },
        ip: ctx.ip,
      });
    });

    revalidateProject(input.code);
    return actionOk(undefined, input.bounced ? 'Bounce recorded.' : 'Response recorded.');
  },
});
