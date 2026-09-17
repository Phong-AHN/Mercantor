'use server';

import { z } from 'zod';
import { clock, ConflictError, formatMoney, type InvoiceStatus, ValidationError } from '@relay/core';
import { transaction } from '@relay/db';
import { actionOk, defineAction } from '@/server/action';
import { audit, notify, recordActivity } from '@/server/record';
import {
  parseDate,
  recomputeHealth,
  resolveProject,
  revalidateProject,
} from '@/features/projects/mutations';

/**
 * Status was a manual dropdown, independent of the actual paid figure -
 * which let "Partially paid" get selected on an invoice nothing had ever
 * been paid against, direct from the milestone edit dialog with no
 * connection to reality. Derived instead, from the two facts that
 * actually determine it: how much has been paid (only `recordPaymentAction`
 * ever changes that - `upsertInvoiceAction` edits everything else about an
 * invoice without touching it), and whether it has been formally sent
 * (has both a number and an invoice date). `OVERDUE` is not produced here -
 * it stays what it already was, a display-layer computation over `PAID`/
 * `PARTIALLY_PAID` plus `dueDate` (`apps/web/src/app/(app)/projects/[code]/invoices/page.tsx`),
 * never a value actually stored.
 */
function deriveInvoiceStatus(input: {
  amountMinor: number;
  paidMinor: number;
  hasNumber: boolean;
  hasInvoiceDate: boolean;
}): InvoiceStatus {
  if (input.paidMinor > 0) {
    return input.paidMinor >= input.amountMinor ? 'PAID' : 'PARTIALLY_PAID';
  }
  return input.hasNumber && input.hasInvoiceDate ? 'INVOICE_SENT' : 'NOT_INVOICED';
}

/**
 * Milestone billing. Amounts are integer minor units end to end - a float would
 * be wrong by a cent eventually, and this is the number people argue about.
 */
export const upsertInvoiceAction = defineAction({
  name: 'invoice.upsert',
  permission: 'invoice:manage',
  input: z.object({
    code: z.string().min(1),
    invoiceId: z.string().uuid().optional(),
    milestone: z.string().trim().min(1, 'Name the milestone.').max(200),
    number: z.string().trim().max(60).optional(),
    /** Major units from the form; converted once, here. */
    amount: z.coerce.number().min(0).max(100_000_000),
    invoiceDate: z.string().optional(),
    dueDate: z.string().optional(),
    notes: z.string().trim().max(1000).optional(),
  }),
  async handler(input, ctx) {
    const project = await resolveProject(ctx.principal, input.code);
    const amountMinor = Math.round(input.amount * 100);

    await transaction(async (tx) => {
      const existing = input.invoiceId
        ? await tx.invoice.findFirst({
            where: { id: input.invoiceId, projectId: project.id },
            select: { id: true, amountMinor: true, paidMinor: true, paidDate: true, status: true },
          })
        : null;
      if (input.invoiceId && !existing) throw new ConflictError('That invoice is not on this project.');
      if (existing && amountMinor < existing.paidMinor) {
        throw new ValidationError('The amount cannot be less than what has been paid.', {
          amount: [`Already paid: ${formatMoney(existing.paidMinor)}.`],
        });
      }

      const invoiceDate = parseDate(input.invoiceDate, 'invoiceDate');
      // Untouched here - only recordPaymentAction ever changes it. Editing a
      // milestone's name, amount, number or dates can shift the *derived*
      // status (e.g. lowering the amount down to what was already paid
      // resolves it to PAID), but never the paid figure itself.
      const paidMinor = existing?.paidMinor ?? 0;
      const status = deriveInvoiceStatus({
        amountMinor,
        paidMinor,
        hasNumber: Boolean(input.number),
        hasInvoiceDate: invoiceDate !== null,
      });
      // The database's own `Invoice_paid_requires_full_amount` constraint
      // requires a non-null `paidDate` whenever status is PAID - reachable
      // here only by editing the amount down to meet an existing paid
      // figure, but still needs a real date if the invoice never had one.
      const paidDate = status === 'PAID' ? (existing?.paidDate ?? invoiceDate ?? clock.now()) : (existing?.paidDate ?? null);

      const data = {
        milestone: input.milestone,
        number: input.number ?? null,
        amountMinor,
        paidMinor,
        paidDate,
        status,
        invoiceDate,
        dueDate: parseDate(input.dueDate, 'dueDate'),
        notes: input.notes ?? null,
      };

      if (existing) {
        await tx.invoice.update({ where: { id: existing.id }, data });
        await audit(tx, {
          principal: ctx.principal,
          projectId: project.id,
          action: 'invoice.update',
          entityType: 'Invoice',
          entityId: existing.id,
          before: existing,
          after: { ...data, invoiceDate: undefined, dueDate: undefined },
          ip: ctx.ip,
        });
      } else {
        const count = await tx.invoice.count({ where: { projectId: project.id } });
        const created = await tx.invoice.create({
          data: { ...data, projectId: project.id, sortOrder: count },
          select: { id: true },
        });
        await audit(tx, {
          principal: ctx.principal,
          projectId: project.id,
          action: 'invoice.create',
          entityType: 'Invoice',
          entityId: created.id,
          after: { milestone: input.milestone, amountMinor, status },
          ip: ctx.ip,
        });
      }

      await recordActivity(tx, {
        projectId: project.id,
        type: 'INVOICE_UPDATED',
        actorId: ctx.principal.id,
        summary: `Invoice updated: ${input.milestone} (${formatMoney(amountMinor)}).`,
        // AHN's own commercial figures - never merchant-facing, and not a
        // SHOPLINE-visible one either (SHOPLINE holds no invoice:read).
        visibility: 'INTERNAL_AHN',
      });

      await recomputeHealth(tx, project.id);
    });

    revalidateProject(input.code);
    return actionOk(undefined, 'Invoice saved.');
  },
});

export const recordPaymentAction = defineAction({
  name: 'invoice.record_payment',
  permission: 'invoice:manage',
  input: z.object({
    code: z.string().min(1),
    invoiceId: z.string().uuid(),
    amount: z.coerce.number().min(0.01, 'Enter the amount received.'),
    paidDate: z.string().optional(),
  }),
  async handler(input, ctx) {
    const project = await resolveProject(ctx.principal, input.code);
    const amountMinor = Math.round(input.amount * 100);
    const paidDate = parseDate(input.paidDate, 'paidDate') ?? clock.now();

    await transaction(async (tx) => {
      const invoice = await tx.invoice.findFirst({
        where: { id: input.invoiceId, projectId: project.id },
        select: {
          id: true,
          milestone: true,
          amountMinor: true,
          paidMinor: true,
          currency: true,
          number: true,
          invoiceDate: true,
        },
      });
      if (!invoice) throw new ConflictError('That invoice is not on this project.');

      const paidMinor = invoice.paidMinor + amountMinor;
      if (paidMinor > invoice.amountMinor) {
        throw new ValidationError('That is more than the invoice is for.', {
          amount: [
            `Outstanding: ${formatMoney(invoice.amountMinor - invoice.paidMinor, invoice.currency)}.`,
          ],
        });
      }
      const status = deriveInvoiceStatus({
        amountMinor: invoice.amountMinor,
        paidMinor,
        hasNumber: invoice.number !== null,
        hasInvoiceDate: invoice.invoiceDate !== null,
      });

      await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          paidMinor,
          paidDate: status === 'PAID' ? paidDate : null,
          status,
        },
      });

      await recordActivity(tx, {
        projectId: project.id,
        type: 'INVOICE_UPDATED',
        actorId: ctx.principal.id,
        summary: `Payment recorded: ${formatMoney(amountMinor, invoice.currency)} against ${invoice.milestone}.`,
        // Same as invoice.upsert above - a commercial figure, not visible to
        // SHOPLINE (no invoice:read) or the merchant.
        visibility: 'INTERNAL_AHN',
      });

      await audit(tx, {
        principal: ctx.principal,
        projectId: project.id,
        action: 'invoice.record_payment',
        entityType: 'Invoice',
        entityId: invoice.id,
        before: { paidMinor: invoice.paidMinor },
        after: { paidMinor },
        ip: ctx.ip,
      });

      await recomputeHealth(tx, project.id);
    });

    revalidateProject(input.code);
    return actionOk(undefined, 'Payment recorded.');
  },
});

/**
 * Refuses anything with a real payment on it - deleting it would erase that
 * payment history with nothing left to show it ever happened, beyond an
 * audit row nobody browsing the invoices tab would think to check. A
 * milestone that was only ever entered wrong (nothing paid yet) has no such
 * history to lose, so the rollup figures on the invoices tab simply
 * recompute without it - they were never a stored, separately-maintained
 * total to begin with (`rollUpInvoices` in `features/projects/snapshot.ts`
 * sums the live `Invoice` rows fresh on every read), so there is nothing to
 * "give back" beyond deleting the row itself.
 */
export const deleteInvoiceAction = defineAction({
  name: 'invoice.delete',
  permission: 'invoice:manage',
  input: z.object({ code: z.string().min(1), invoiceId: z.string().uuid() }),
  async handler(input, ctx) {
    const project = await resolveProject(ctx.principal, input.code);

    await transaction(async (tx) => {
      const invoice = await tx.invoice.findFirst({
        where: { id: input.invoiceId, projectId: project.id },
        select: {
          id: true,
          milestone: true,
          number: true,
          amountMinor: true,
          paidMinor: true,
          currency: true,
          status: true,
        },
      });
      if (!invoice) throw new ConflictError('That invoice is not on this project.');
      if (invoice.paidMinor > 0) {
        throw new ValidationError(
          `${formatMoney(invoice.paidMinor, invoice.currency)} is already paid against this milestone - remove that payment history first is not supported, so it cannot be deleted.`,
        );
      }

      await tx.invoice.delete({ where: { id: invoice.id } });

      await recordActivity(tx, {
        projectId: project.id,
        type: 'INVOICE_UPDATED',
        actorId: ctx.principal.id,
        summary: `Invoice removed: ${invoice.milestone}.`,
        visibility: 'INTERNAL_AHN',
      });

      await audit(tx, {
        principal: ctx.principal,
        projectId: project.id,
        action: 'invoice.delete',
        entityType: 'Invoice',
        entityId: invoice.id,
        before: invoice,
        ip: ctx.ip,
      });

      await recomputeHealth(tx, project.id);
    });

    revalidateProject(input.code);
    return actionOk(undefined, 'Invoice removed.');
  },
});

export const chaseInvoiceAction = defineAction({
  name: 'invoice.chase',
  permission: 'invoice:manage',
  input: z.object({ code: z.string().min(1), invoiceId: z.string().uuid() }),
  async handler(input, ctx) {
    const project = await resolveProject(ctx.principal, input.code);

    await transaction(async (tx) => {
      const invoice = await tx.invoice.findFirst({
        where: { id: input.invoiceId, projectId: project.id },
        select: { id: true, milestone: true, amountMinor: true, paidMinor: true, currency: true },
      });
      if (!invoice) throw new ConflictError('That invoice is not on this project.');

      // AHN-only: the notification body states the exact outstanding
      // balance, and SHOPLINE holds no invoice:read - this used to also
      // notify `shoplineAmId`, back when money was still an AHN/SHOPLINE
      // conversation.
      const watchers = await tx.project.findUnique({
        where: { id: project.id },
        select: { ahnProjectManagerId: true },
      });

      await notify(tx, {
        userIds: [watchers?.ahnProjectManagerId].filter((id): id is string => typeof id === 'string'),
        projectId: project.id,
        type: 'INVOICE_OVERDUE',
        title: `${project.merchantName}: ${invoice.milestone} still outstanding`,
        body: `${formatMoney(invoice.amountMinor - invoice.paidMinor, invoice.currency)} outstanding.`,
        href: `/projects/${project.code}/invoices`,
        exceptUserId: ctx.principal.id,
      });

      await audit(tx, {
        principal: ctx.principal,
        projectId: project.id,
        action: 'invoice.chase',
        entityType: 'Invoice',
        entityId: invoice.id,
        ip: ctx.ip,
      });
    });

    revalidateProject(input.code);
    return actionOk(undefined, 'Reminder sent.');
  },
});
