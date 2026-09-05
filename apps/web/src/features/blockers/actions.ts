'use server';

import { z } from 'zod';
import {
  BLOCKER_CATEGORIES,
  BLOCKER_CATEGORY_LABEL,
  BLOCKER_CATEGORY_TEAM,
  clock,
  ConflictError,
  TEAM_LABEL,
  TEAMS,
  type Team,
} from '@relay/core';
import { transaction } from '@relay/db';
import { actionOk, defineAction } from '@/server/action';
import { audit, notify, recordActivity } from '@/server/record';
import {
  fanOut,
  nudgeWorker,
  parseDate,
  recomputeHealth,
  resolveProject,
  revalidateProject,
} from '@/features/projects/mutations';

/**
 * Blockers carry their own clock. Opening one starts an ownership span;
 * reassigning stops the previous owner's span and starts the next one, which is
 * exactly what `computeProjectTime` reads to answer "who owns the delay".
 */
export const openBlockerAction = defineAction({
  name: 'blocker.open',
  permission: 'blocker:manage',
  input: z.object({
    code: z.string().min(1),
    category: z.enum(BLOCKER_CATEGORIES),
    title: z.string().trim().min(3, 'Give the blocker a title.').max(200),
    description: z.string().trim().max(4000).optional(),
    nextAction: z.string().trim().min(3, 'Say what unblocks it.').max(500),
    ownerTeam: z.enum(TEAMS).optional(),
    ownerUserId: z.string().uuid().optional(),
    dueDate: z.string().optional(),
  }),
  async handler(input, ctx) {
    const project = await resolveProject(ctx.principal, input.code);
    const ownerTeam: Team = input.ownerTeam ?? BLOCKER_CATEGORY_TEAM[input.category];
    const now = clock.now();
    const dueDate = parseDate(input.dueDate, 'dueDate');

    const outboxIds = await transaction(async (tx) => {
      const blocker = await tx.blocker.create({
        data: {
          projectId: project.id,
          category: input.category,
          title: input.title,
          description: input.description ?? null,
          ownerTeam,
          ownerUserId: input.ownerUserId ?? null,
          nextAction: input.nextAction,
          dueDate,
          startedAt: now,
          createdById: ctx.principal.id,
          ownerships: {
            create: {
              ownerTeam,
              ownerUserId: input.ownerUserId ?? null,
              startedAt: now,
              note: 'Blocker opened.',
            },
          },
        },
        select: { id: true },
      });

      await recordActivity(tx, {
        projectId: project.id,
        type: 'BLOCKER_OPENED',
        actorId: ctx.principal.id,
        summary: `Blocker opened: ${input.title}`,
        detail: input.nextAction,
        // Merchants must see what they are being asked for.
        visibility: ownerTeam === 'MERCHANT' ? 'EVERYONE' : 'AHN_SHOPLINE',
        payload: { blockerId: blocker.id, category: input.category, ownerTeam },
      });

      await audit(tx, {
        principal: ctx.principal,
        projectId: project.id,
        action: 'blocker.open',
        entityType: 'Blocker',
        entityId: blocker.id,
        after: { title: input.title, category: input.category, ownerTeam },
        ip: ctx.ip,
      });

      await notifyOwners(tx, project.id, ownerTeam, {
        projectCode: project.code,
        title: `${project.merchantName} is blocked: ${input.title}`,
        body: input.nextAction,
        actorId: ctx.principal.id,
        explicitUserId: input.ownerUserId,
      });

      await recomputeHealth(tx, project.id);

      return fanOut(tx, {
        projectId: project.id,
        projectCode: project.code,
        title: `Blocked: ${input.title}`,
        body: input.nextAction,
        tone: 'danger',
        fields: [
          { label: 'Category', value: BLOCKER_CATEGORY_LABEL[input.category].label },
          { label: 'Owner', value: TEAM_LABEL[ownerTeam].label },
          ...(dueDate ? [{ label: 'Due', value: dueDate.toISOString().slice(0, 10) }] : []),
        ],
      });
    });

    await nudgeWorker(outboxIds);
    revalidateProject(input.code);
    return actionOk(undefined, 'Blocker opened.');
  },
});

/**
 * Handing a blocker over. The previous owner's timer stops at the same instant
 * the next one's starts - the partial unique index makes two open spans
 * impossible, so the arithmetic can never double count.
 */
export const reassignBlockerAction = defineAction({
  name: 'blocker.reassign',
  permission: 'blocker:manage',
  input: z.object({
    code: z.string().min(1),
    blockerId: z.string().uuid(),
    ownerTeam: z.enum(TEAMS),
    ownerUserId: z.string().uuid().optional(),
    note: z.string().trim().max(500).optional(),
  }),
  async handler(input, ctx) {
    const project = await resolveProject(ctx.principal, input.code);
    const now = clock.now();

    await transaction(async (tx) => {
      const blocker = await tx.blocker.findFirst({
        where: { id: input.blockerId, projectId: project.id },
        select: { id: true, title: true, ownerTeam: true, resolvedAt: true },
      });
      if (!blocker) throw new ConflictError('That blocker is not on this project.');
      if (blocker.resolvedAt) throw new ConflictError('That blocker is already resolved.');
      if (blocker.ownerTeam === input.ownerTeam && !input.ownerUserId) {
        throw new ConflictError('That blocker already sits with this team.');
      }

      const open = await tx.blockerOwnership.findFirst({
        where: { blockerId: blocker.id, endedAt: null },
        select: { id: true, startedAt: true },
      });
      if (open) {
        await tx.blockerOwnership.update({
          where: { id: open.id },
          data: {
            endedAt: now,
            durationMs: BigInt(Math.max(0, now.getTime() - open.startedAt.getTime())),
          },
        });
      }

      await tx.blockerOwnership.create({
        data: {
          blockerId: blocker.id,
          ownerTeam: input.ownerTeam,
          ownerUserId: input.ownerUserId ?? null,
          startedAt: now,
          note: input.note ?? null,
        },
      });

      await tx.blocker.update({
        where: { id: blocker.id },
        data: { ownerTeam: input.ownerTeam, ownerUserId: input.ownerUserId ?? null },
      });

      await recordActivity(tx, {
        projectId: project.id,
        type: 'BLOCKER_OWNER_CHANGED',
        actorId: ctx.principal.id,
        summary: `Blocker "${blocker.title}" moved to ${TEAM_LABEL[input.ownerTeam].label}.`,
        detail: input.note ?? null,
        visibility: input.ownerTeam === 'MERCHANT' ? 'EVERYONE' : 'AHN_SHOPLINE',
        payload: { blockerId: blocker.id, from: blocker.ownerTeam, to: input.ownerTeam },
      });

      await audit(tx, {
        principal: ctx.principal,
        projectId: project.id,
        action: 'blocker.reassign',
        entityType: 'Blocker',
        entityId: blocker.id,
        before: { ownerTeam: blocker.ownerTeam },
        after: { ownerTeam: input.ownerTeam },
        reason: input.note ?? null,
        ip: ctx.ip,
      });

      await notifyOwners(tx, project.id, input.ownerTeam, {
        projectCode: project.code,
        title: `A blocker on ${project.merchantName} is now yours`,
        body: blocker.title,
        actorId: ctx.principal.id,
        explicitUserId: input.ownerUserId,
      });

      await recomputeHealth(tx, project.id);
    });

    revalidateProject(input.code);
    return actionOk(undefined, `Blocker moved to ${TEAM_LABEL[input.ownerTeam].label}.`);
  },
});

export const resolveBlockerAction = defineAction({
  name: 'blocker.resolve',
  permission: 'blocker:manage',
  input: z.object({
    code: z.string().min(1),
    blockerId: z.string().uuid(),
    resolution: z.string().trim().min(3, 'Say how it was resolved.').max(2000),
  }),
  async handler(input, ctx) {
    const project = await resolveProject(ctx.principal, input.code);
    const now = clock.now();

    const outboxIds = await transaction(async (tx) => {
      const blocker = await tx.blocker.findFirst({
        where: { id: input.blockerId, projectId: project.id },
        select: { id: true, title: true, startedAt: true, resolvedAt: true },
      });
      if (!blocker) throw new ConflictError('That blocker is not on this project.');
      if (blocker.resolvedAt) throw new ConflictError('That blocker is already resolved.');

      const open = await tx.blockerOwnership.findFirst({
        where: { blockerId: blocker.id, endedAt: null },
        select: { id: true, startedAt: true },
      });
      if (open) {
        await tx.blockerOwnership.update({
          where: { id: open.id },
          data: {
            endedAt: now,
            durationMs: BigInt(Math.max(0, now.getTime() - open.startedAt.getTime())),
          },
        });
      }

      await tx.blocker.update({
        where: { id: blocker.id },
        data: { resolvedAt: now, resolution: input.resolution },
      });

      await recordActivity(tx, {
        projectId: project.id,
        type: 'BLOCKER_RESOLVED',
        actorId: ctx.principal.id,
        summary: `Blocker resolved: ${blocker.title}`,
        detail: input.resolution,
        visibility: 'EVERYONE',
        payload: {
          blockerId: blocker.id,
          openForMs: now.getTime() - blocker.startedAt.getTime(),
        },
      });

      await audit(tx, {
        principal: ctx.principal,
        projectId: project.id,
        action: 'blocker.resolve',
        entityType: 'Blocker',
        entityId: blocker.id,
        after: { resolution: input.resolution },
        ip: ctx.ip,
      });

      await recomputeHealth(tx, project.id);

      return fanOut(tx, {
        projectId: project.id,
        projectCode: project.code,
        title: `Unblocked: ${blocker.title}`,
        body: input.resolution,
        tone: 'success',
      });
    });

    await nudgeWorker(outboxIds);
    revalidateProject(input.code);
    return actionOk(undefined, 'Blocker resolved.');
  },
});

/** Notifies the people on the receiving team, and never the person acting. */
async function notifyOwners(
  tx: Parameters<typeof recordActivity>[0],
  projectId: string,
  ownerTeam: Team,
  input: {
    projectCode: string;
    title: string;
    body: string;
    actorId: string;
    explicitUserId?: string;
  },
): Promise<void> {
  const project = await tx.project.findUnique({
    where: { id: projectId },
    select: {
      ahnProjectManagerId: true,
      ahnDeveloperId: true,
      shoplineAmId: true,
      shoplineSeId: true,
      members: { select: { userId: true } },
    },
  });
  if (!project) return;

  const byTeam: Record<Team, (string | null)[]> = {
    AHN: [project.ahnProjectManagerId, project.ahnDeveloperId],
    SHOPLINE: [project.shoplineAmId, project.shoplineSeId],
    MERCHANT: project.members.map((member) => member.userId),
    OTHER: [project.ahnProjectManagerId],
  };

  const recipients = [
    ...(input.explicitUserId ? [input.explicitUserId] : []),
    ...byTeam[ownerTeam],
  ].filter((id): id is string => typeof id === 'string');

  await notify(tx, {
    userIds: recipients,
    projectId,
    type: 'LAUNCH_BLOCKER',
    title: input.title,
    body: input.body,
    href: `/projects/${input.projectCode}/blockers`,
    exceptUserId: input.actorId,
  });
}
