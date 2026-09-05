'use server';

import { z } from 'zod';
import {
  ACCESS_STATUSES,
  ACCESS_STATUS_LABEL,
  ASSET_STATUSES,
  ASSET_STATUS_LABEL,
  clock,
  ConflictError,
  formatMoney,
  ForbiddenError,
  SCOPE_DISPOSITIONS,
  SCOPE_STATUSES,
  ValidationError,
  type AccessStatus,
  type AssetStatus,
} from '@relay/core';
import { transaction } from '@relay/db';
import { can } from '@relay/rbac';
import { actionOk, defineAction } from '@/server/action';
import { audit, recordActivity } from '@/server/record';
import {
  fanOut,
  nudgeWorker,
  parseDate,
  recomputeHealth,
  resolveProject,
  revalidateProject,
} from '@/features/projects/mutations';

/**
 * Access, assets and scope. The three checklists that answer "what are we
 * waiting for" before a blocker has been raised about it.
 */

/** Timestamps that must move with the status, so the history stays true. */
function accessTimestamps(status: AccessStatus, now: Date) {
  return {
    requestedAt: status === 'NOT_REQUESTED' ? null : now,
    receivedAt:
      status === 'RECEIVED' || status === 'VERIFIED'
        ? now
        : status === 'NOT_REQUESTED' || status === 'REQUESTED'
          ? null
          : undefined,
    verifiedAt: status === 'VERIFIED' ? now : status === 'ISSUE' ? null : undefined,
  };
}

export const setAccessStatusAction = defineAction({
  name: 'access.set_status',
  permission: ['access:read'],
  input: z.object({
    code: z.string().min(1),
    itemId: z.string().uuid(),
    status: z.enum(ACCESS_STATUSES),
    notes: z.string().trim().max(1000).optional(),
  }),
  async handler(input, ctx) {
    const project = await resolveProject(ctx.principal, input.code);

    // A merchant may say "here it is"; only AHN may say "verified".
    const manages = can(ctx.principal, 'access:manage');
    const provides = can(ctx.principal, 'access:provide');
    const merchantAllowed: AccessStatus[] = ['RECEIVED', 'ISSUE'];
    if (!manages && !(provides && merchantAllowed.includes(input.status))) {
      throw new ForbiddenError(
        'You can mark access as provided, but only AHN can verify it works.',
        { status: input.status },
      );
    }

    const now = clock.now();

    const outboxIds = await transaction(async (tx) => {
      const item = await tx.accessItem.findFirst({
        where: { id: input.itemId, projectId: project.id },
        select: { id: true, label: true, status: true, blocking: true },
      });
      if (!item) throw new ConflictError('That access item is not on this project.');
      if (item.status === input.status && input.notes === undefined) {
        return [];
      }

      await tx.accessItem.update({
        where: { id: item.id },
        data: {
          status: input.status,
          notes: input.notes,
          ...accessTimestamps(input.status, now),
        },
      });

      await recordActivity(tx, {
        projectId: project.id,
        type: 'ACCESS_STATUS_CHANGED',
        actorId: ctx.principal.id,
        summary: `${item.label}: ${ACCESS_STATUS_LABEL[input.status].label.toLowerCase()}.`,
        detail: input.notes ?? null,
        visibility: 'EVERYONE',
        payload: { itemId: item.id, from: item.status, to: input.status },
      });

      await audit(tx, {
        principal: ctx.principal,
        projectId: project.id,
        action: 'access.set_status',
        entityType: 'AccessItem',
        entityId: item.id,
        before: { status: item.status },
        after: { status: input.status },
        ip: ctx.ip,
      });

      await recomputeHealth(tx, project.id);

      // A blocking credential landing is genuinely news; the rest is not.
      if (item.blocking && input.status === 'VERIFIED') {
        return fanOut(tx, {
          projectId: project.id,
          projectCode: project.code,
          title: `${item.label} verified on ${project.merchantName}`,
          tone: 'success',
        });
      }
      if (item.blocking && input.status === 'ISSUE') {
        return fanOut(tx, {
          projectId: project.id,
          projectCode: project.code,
          title: `Problem with ${item.label} on ${project.merchantName}`,
          body: input.notes ?? 'Access is not working.',
          tone: 'danger',
        });
      }
      return [];
    });

    await nudgeWorker(outboxIds);
    revalidateProject(input.code);
    return actionOk(undefined, `${ACCESS_STATUS_LABEL[input.status].label}.`);
  },
});

export const setAssetStatusAction = defineAction({
  name: 'asset.set_status',
  permission: ['asset:read'],
  input: z.object({
    code: z.string().min(1),
    itemId: z.string().uuid(),
    status: z.enum(ASSET_STATUSES),
    notes: z.string().trim().max(1000).optional(),
    dueDate: z.string().optional(),
  }),
  async handler(input, ctx) {
    const project = await resolveProject(ctx.principal, input.code);

    const manages = can(ctx.principal, 'asset:manage');
    const uploads = can(ctx.principal, 'asset:upload');
    const merchantAllowed: AssetStatus[] = ['RECEIVED'];
    if (!manages && !(uploads && merchantAllowed.includes(input.status))) {
      throw new ForbiddenError('You can submit assets, but only AHN can approve them.');
    }

    const now = clock.now();
    const dueDate = parseDate(input.dueDate, 'dueDate');

    await transaction(async (tx) => {
      const item = await tx.assetItem.findFirst({
        where: { id: input.itemId, projectId: project.id },
        select: { id: true, label: true, status: true },
      });
      if (!item) throw new ConflictError('That asset is not on this project.');

      await tx.assetItem.update({
        where: { id: item.id },
        data: {
          status: input.status,
          notes: input.notes,
          dueDate: input.dueDate === undefined ? undefined : dueDate,
          receivedAt:
            input.status === 'RECEIVED' || input.status === 'APPROVED'
              ? now
              : input.status === 'NOT_REQUESTED' || input.status === 'REQUESTED'
                ? null
                : undefined,
          approvedAt: input.status === 'APPROVED' ? now : null,
        },
      });

      await recordActivity(tx, {
        projectId: project.id,
        type: 'ASSET_STATUS_CHANGED',
        actorId: ctx.principal.id,
        summary: `${item.label}: ${ASSET_STATUS_LABEL[input.status].label.toLowerCase()}.`,
        detail: input.notes ?? null,
        visibility: 'EVERYONE',
        payload: { itemId: item.id, from: item.status, to: input.status },
      });

      await audit(tx, {
        principal: ctx.principal,
        projectId: project.id,
        action: 'asset.set_status',
        entityType: 'AssetItem',
        entityId: item.id,
        before: { status: item.status },
        after: { status: input.status },
        ip: ctx.ip,
      });

      await recomputeHealth(tx, project.id);
    });

    revalidateProject(input.code);
    return actionOk(undefined, `${ASSET_STATUS_LABEL[input.status].label}.`);
  },
});

export const attachLinkAction = defineAction({
  name: 'attachment.add_link',
  permission: ['asset:upload'],
  input: z.object({
    code: z.string().min(1),
    label: z.string().trim().min(1, 'Give the link a label.').max(200),
    url: z.string().trim().url('That is not a valid URL.'),
    assetItemId: z.string().uuid().optional(),
    accessItemId: z.string().uuid().optional(),
    issueId: z.string().uuid().optional(),
  }),
  async handler(input, ctx) {
    const project = await resolveProject(ctx.principal, input.code);

    await transaction(async (tx) => {
      const attachment = await tx.attachment.create({
        data: {
          projectId: project.id,
          kind: 'LINK',
          label: input.label,
          url: input.url,
          uploadedById: ctx.principal.id,
          assetItemId: input.assetItemId ?? null,
          accessItemId: input.accessItemId ?? null,
          issueId: input.issueId ?? null,
        },
        select: { id: true },
      });

      await recordActivity(tx, {
        projectId: project.id,
        type: 'ASSET_STATUS_CHANGED',
        actorId: ctx.principal.id,
        summary: `Link attached: ${input.label}`,
        detail: input.url,
        visibility: 'EVERYONE',
        payload: { attachmentId: attachment.id },
      });

      await audit(tx, {
        principal: ctx.principal,
        projectId: project.id,
        action: 'attachment.add_link',
        entityType: 'Attachment',
        entityId: attachment.id,
        after: { label: input.label, url: input.url },
        ip: ctx.ip,
      });
    });

    revalidateProject(input.code);
    return actionOk(undefined, 'Link attached.');
  },
});

export const updateScopeItemAction = defineAction({
  name: 'scope.update',
  permission: 'scope:manage',
  input: z.object({
    code: z.string().min(1),
    itemId: z.string().uuid(),
    disposition: z.enum(SCOPE_DISPOSITIONS).optional(),
    status: z.enum(SCOPE_STATUSES).optional(),
    sourceCount: z.coerce.number().int().min(0).optional(),
    migratedCount: z.coerce.number().int().min(0).optional(),
    notes: z.string().trim().max(1000).optional(),
    changeRequestAmountMinor: z.coerce.number().int().min(0).optional(),
  }),
  async handler(input, ctx) {
    const project = await resolveProject(ctx.principal, input.code);

    const outboxIds = await transaction(async (tx) => {
      const item = await tx.scopeItem.findFirst({
        where: { id: input.itemId, projectId: project.id },
        select: {
          id: true,
          label: true,
          disposition: true,
          status: true,
          sourceCount: true,
          migratedCount: true,
        },
      });
      if (!item) throw new ConflictError('That scope item is not on this project.');

      await tx.scopeItem.update({
        where: { id: item.id },
        data: {
          disposition: input.disposition,
          status: input.status,
          sourceCount: input.sourceCount,
          migratedCount: input.migratedCount,
          notes: input.notes,
          changeRequestAmountMinor: input.changeRequestAmountMinor,
        },
      });

      await recordActivity(tx, {
        projectId: project.id,
        type: 'SCOPE_CHANGED',
        actorId: ctx.principal.id,
        summary: `Scope updated: ${item.label}`,
        detail: input.notes ?? null,
        visibility: 'AHN_SHOPLINE',
        payload: {
          itemId: item.id,
          from: item.disposition,
          to: input.disposition ?? item.disposition,
        },
      });

      await audit(tx, {
        principal: ctx.principal,
        projectId: project.id,
        action: 'scope.update',
        entityType: 'ScopeItem',
        entityId: item.id,
        before: item,
        after: input,
        ip: ctx.ip,
      });

      // A change request is a commercial event: SHOPLINE needs to know.
      if (input.disposition === 'CHANGE_REQUEST' && item.disposition !== 'CHANGE_REQUEST') {
        return fanOut(tx, {
          projectId: project.id,
          projectCode: project.code,
          title: `Change request raised on ${project.merchantName}: ${item.label}`,
          body: input.notes ?? 'Outside the agreed scope. Needs pricing and approval.',
          tone: 'warning',
        });
      }
      return [];
    });

    await nudgeWorker(outboxIds);
    revalidateProject(input.code);
    return actionOk(undefined, 'Scope updated.');
  },
});

/**
 * The commercial decision on a change request: agreeing the price is not the
 * same as agreeing to pay it. Gated by `invoice:manage` (not `scope:manage`,
 * which every AHN delivery role holds) because it is a money decision, not a
 * scope one - the same distinction D-012 draws for approvals generally.
 *
 * Approving creates the invoice line in the same transaction as the
 * approval, rather than leaving that as a separate step someone has to
 * remember: an approved change request with no billable line is not a state
 * this product wants to be able to represent.
 */
export const approveChangeRequestAction = defineAction({
  name: 'scope.approve_change_request',
  permission: 'invoice:manage',
  input: z.object({
    code: z.string().min(1),
    itemId: z.string().uuid(),
  }),
  async handler(input, ctx) {
    const project = await resolveProject(ctx.principal, input.code);

    const outboxIds = await transaction(async (tx) => {
      const item = await tx.scopeItem.findFirst({
        where: { id: input.itemId, projectId: project.id },
        select: {
          id: true,
          label: true,
          disposition: true,
          changeRequestAmountMinor: true,
          changeRequestApprovedAt: true,
        },
      });
      if (!item) throw new ConflictError('That scope item is not on this project.');
      if (item.disposition !== 'CHANGE_REQUEST') {
        throw new ValidationError('Only a change request can be approved.');
      }
      if (item.changeRequestAmountMinor === null) {
        throw new ValidationError('Price it before approving it.');
      }
      if (item.changeRequestApprovedAt !== null) {
        throw new ConflictError('That change request is already approved.');
      }

      const now = clock.now();
      const amountMinor = item.changeRequestAmountMinor;

      await tx.scopeItem.update({
        where: { id: item.id },
        data: { changeRequestApprovedAt: now },
      });

      const invoiceCount = await tx.invoice.count({ where: { projectId: project.id } });
      const invoice = await tx.invoice.create({
        data: {
          projectId: project.id,
          scopeItemId: item.id,
          milestone: `Change request: ${item.label}`,
          amountMinor,
          currency: project.currency,
          status: 'NOT_INVOICED',
          sortOrder: invoiceCount,
        },
        select: { id: true },
      });

      await recordActivity(tx, {
        projectId: project.id,
        type: 'SCOPE_CHANGED',
        actorId: ctx.principal.id,
        summary: `Change request approved: ${item.label} (${formatMoney(amountMinor, project.currency)})`,
        detail: 'Added as a new invoice line.',
        visibility: 'AHN_SHOPLINE',
        payload: { itemId: item.id, invoiceId: invoice.id },
      });

      await audit(tx, {
        principal: ctx.principal,
        projectId: project.id,
        action: 'scope.approve_change_request',
        entityType: 'ScopeItem',
        entityId: item.id,
        before: { changeRequestApprovedAt: null },
        after: { changeRequestApprovedAt: now, invoiceId: invoice.id, amountMinor },
        ip: ctx.ip,
      });

      await recomputeHealth(tx, project.id);

      return fanOut(tx, {
        projectId: project.id,
        projectCode: project.code,
        title: `Change request approved on ${project.merchantName}: ${item.label}`,
        body: `${formatMoney(amountMinor, project.currency)} added as a new invoice line.`,
        tone: 'info',
      });
    });

    await nudgeWorker(outboxIds);
    revalidateProject(input.code);
    return actionOk(undefined, 'Change request approved. Invoice line created.');
  },
});
