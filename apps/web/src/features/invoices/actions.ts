'use server';

import { z } from 'zod';
import { clock, ConflictError, formatMoney, INVOICE_STATUSES, ValidationError } from '@relay/core';
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
    status: z.enum(INVOICE_STATUSES),
    invoiceDate: z.string().optional(),
    dueDate: z.string().optional(),
    notes: z.string().trim().max(1000).optional(),
  }),
  async handler(input, ctx) {
    const project = await resolveProject(ctx.principal, input.code);
    const amountMinor = Math.round(input.amount * 100);

    if (input.status !== 'NOT_INVOICED' && (!input.number || !input.invoiceDate)) {
      throw new ValidationError('A sent invoice needs a number and a date.', {
        number: input.number ? [] : ['Enter the invoice number.'],
        invoiceDate: input.invoiceDate ? [] : ['Enter the invoice date.'],
      });
    }

    await transaction(async (tx) => {
      const data = {
        milestone: input.milestone,
        number: input.number ?? null,
        amountMinor,
        status: input.status,
        invoiceDate: parseDate(input.invoiceDate, 'invoiceDate'),
        dueDate: parseDate(input.dueDate, 'dueDate'),
        notes: input.notes ?? null,
      };

      if (input.invoiceId) {
        const existing = await tx.invoice.findFirst({
          where: { id: input.invoiceId, projectId: project.id },
          select: { id: true, amountMinor: true, paidMinor: true, status: true },
        });
        if (!existing) throw new ConflictError('That invoice is not on this project.');
        if (amountMinor < existing.paidMinor) {
          throw new ValidationError('The amount cannot be less than what has been paid.', {
            amount: [`Already paid: ${formatMoney(existing.paidMinor)}.`],
          });
        }
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
          after: { milestone: input.milestone, amountMinor, status: input.status },
          ip: ctx.ip,
        });
      }

      await recordActivity(tx, {
        projectId: project.id,
        type: 'INVOICE_UPDATED',
        actorId: ctx.principal.id,
        summary: `Invoice updated: ${input.milestone} (${formatMoney(amountMinor)}).`,
        // Money is an AHN/SHOPLINE conversation, never a merchant-facing one.
        visibility: 'AHN_SHOPLINE',
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
        select: { id: true, milestone: true, amountMinor: true, paidMinor: true, currency: true },
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

      await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          paidMinor,
          paidDate: paidMinor >= invoice.amountMinor ? paidDate : null,
          status: paidMinor >= invoice.amountMinor ? 'PAID' : 'PARTIALLY_PAID',
        },
      });

      await recordActivity(tx, {
        projectId: project.id,
        type: 'INVOICE_UPDATED',
        actorId: ctx.principal.id,
        summary: `Payment recorded: ${formatMoney(amountMinor, invoice.currency)} against ${invoice.milestone}.`,
        visibility: 'AHN_SHOPLINE',
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

      const watchers = await tx.project.findUnique({
        where: { id: project.id },
        select: { shoplineAmId: true, ahnProjectManagerId: true },
      });

      await notify(tx, {
        userIds: [watchers?.shoplineAmId, watchers?.ahnProjectManagerId].filter(
          (id): id is string => typeof id === 'string',
        ),
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
