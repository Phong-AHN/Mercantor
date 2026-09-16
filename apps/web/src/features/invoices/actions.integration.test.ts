import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '@relay/db';
import { readableVisibilities } from '@relay/rbac';
import {
  cleanupFixtures,
  createTestProject,
  createTestUser,
  signInAs,
  type TestUser,
} from '../../../test/fixtures';
import { chaseInvoiceAction, recordPaymentAction, upsertInvoiceAction } from './actions';

/**
 * Money as integer minor units, end to end (D-016): a payment tips an
 * invoice to `PARTIALLY_PAID` or `PAID` based on the real running total in
 * the database, never the amount just entered, and the server refuses to
 * record more than the invoice is for - the one arithmetic mistake that
 * would actually matter to someone reading the outstanding balance.
 */
describe('invoice payment arithmetic', () => {
  let pm: TestUser;
  let projectCode: string;
  let invoiceId: string;

  beforeAll(async () => {
    pm = await createTestUser('AHN_PROJECT_MANAGER');
    const project = await createTestProject({ as: pm, ahnProjectManagerId: pm.id });
    projectCode = project.code;

    await signInAs(pm);
    const created = await upsertInvoiceAction({
      code: projectCode,
      milestone: 'Deposit',
      number: 'INV-1001',
      amount: 1000,
      status: 'INVOICE_SENT',
      invoiceDate: '2026-01-01',
    });
    expect(created.ok).toBe(true);

    const row = await db.invoice.findFirstOrThrow({
      where: { projectId: project.id },
      select: { id: true },
    });
    invoiceId = row.id;
  });

  afterAll(async () => {
    await cleanupFixtures();
  });

  it('a partial payment moves the invoice to PARTIALLY_PAID and leaves no paid date', async () => {
    const result = await recordPaymentAction({
      code: projectCode,
      invoiceId,
      amount: 400,
    });
    expect(result.ok).toBe(true);

    const invoice = await db.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    expect(invoice.paidMinor).toBe(40_000);
    expect(invoice.status).toBe('PARTIALLY_PAID');
    expect(invoice.paidDate).toBeNull();
  });

  it('a payment that reaches the full amount moves it to PAID, with a paid date', async () => {
    const result = await recordPaymentAction({
      code: projectCode,
      invoiceId,
      amount: 600,
      paidDate: '2026-02-01',
    });
    expect(result.ok).toBe(true);

    const invoice = await db.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    expect(invoice.paidMinor).toBe(100_000);
    expect(invoice.status).toBe('PAID');
    expect(invoice.paidDate?.toISOString().slice(0, 10)).toBe('2026-02-01');
  });

  it('refuses a payment that would exceed the invoice, and changes nothing', async () => {
    const before = await db.invoice.findUniqueOrThrow({ where: { id: invoiceId } });

    const result = await recordPaymentAction({
      code: projectCode,
      invoiceId,
      amount: 0.01,
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.code).toBe('VALIDATION_FAILED');

    const after = await db.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    expect(after.paidMinor).toBe(before.paidMinor);
    expect(after.status).toBe(before.status);
  });

  it('two partial payments accumulate rather than overwrite', async () => {
    const created = await upsertInvoiceAction({
      code: projectCode,
      milestone: 'Final',
      number: 'INV-1002',
      amount: 500,
      status: 'INVOICE_SENT',
      invoiceDate: '2026-01-01',
    });
    expect(created.ok).toBe(true);

    const project = await db.project.findFirstOrThrow({
      where: { code: projectCode },
      select: { id: true },
    });
    const second = await db.invoice.findFirstOrThrow({
      where: { projectId: project.id, milestone: 'Final' },
      select: { id: true },
    });

    await recordPaymentAction({ code: projectCode, invoiceId: second.id, amount: 200 });
    await recordPaymentAction({ code: projectCode, invoiceId: second.id, amount: 150 });

    const invoice = await db.invoice.findUniqueOrThrow({ where: { id: second.id } });
    expect(invoice.paidMinor).toBe(35_000);
    expect(invoice.status).toBe('PARTIALLY_PAID');
  });
});

/**
 * Regression coverage for a real leak: SHOPLINE lost `invoice:read` (the
 * dedicated tab, the portfolio table's money column, the answer-tile strip),
 * but the activity feed and a chase notification kept surfacing the same
 * figures through a different door - `visibility: 'AHN_SHOPLINE'` on the
 * activity rows, and `shoplineAmId` in the chase notification's recipients.
 * A SHOPLINE Account Manager reported still seeing an invoice amount on the
 * live site; this is exactly where it was coming from.
 */
describe('money stays out of SHOPLINE-visible channels', () => {
  let pm: TestUser;
  let shoplineAm: TestUser;
  let projectCode: string;
  let projectId: string;
  let invoiceId: string;

  beforeAll(async () => {
    pm = await createTestUser('AHN_PROJECT_MANAGER');
    shoplineAm = await createTestUser('SHOPLINE_ACCOUNT_MANAGER');
    const project = await createTestProject({
      as: pm,
      ahnProjectManagerId: pm.id,
      shoplineAmId: shoplineAm.id,
    });
    projectCode = project.code;
    projectId = project.id;

    await signInAs(pm);
    const created = await upsertInvoiceAction({
      code: projectCode,
      milestone: 'Deposit',
      number: 'INV-2001',
      amount: 2500,
      status: 'INVOICE_SENT',
      invoiceDate: '2026-01-01',
    });
    expect(created.ok).toBe(true);
    invoiceId = (
      await db.invoice.findFirstOrThrow({ where: { projectId }, select: { id: true } })
    ).id;

    await recordPaymentAction({ code: projectCode, invoiceId, amount: 500 });
    await chaseInvoiceAction({ code: projectCode, invoiceId });
  });

  afterAll(async () => {
    await cleanupFixtures();
  });

  it('records the invoice-update and payment activity as INTERNAL_AHN, not readable by SHOPLINE', async () => {
    const events = await db.activityEvent.findMany({
      where: { projectId, type: 'INVOICE_UPDATED' },
      select: { visibility: true, summary: true },
    });
    expect(events.length).toBeGreaterThanOrEqual(2);
    for (const event of events) {
      expect(event.visibility).toBe('INTERNAL_AHN');
    }

    const shoplineVisible = readableVisibilities(shoplineAm);
    expect(shoplineVisible).not.toContain('INTERNAL_AHN');
    for (const event of events) {
      expect(shoplineVisible).not.toContain(event.visibility);
    }
  });

  it('never notifies the SHOPLINE account manager when an invoice is chased', async () => {
    // Filtered to this action's own notification type - project creation
    // legitimately sends the SHOPLINE AM an unrelated "you were assigned"
    // notification, which is not what this test is guarding against.
    const notifications = await db.notification.findMany({
      where: { userId: shoplineAm.id, projectId, type: 'INVOICE_OVERDUE' },
    });
    expect(notifications).toHaveLength(0);
  });
});

/**
 * Regression coverage for a real production crash: the database's own
 * `Invoice_paid_requires_full_amount` check constraint requires
 * `paidMinor = amountMinor` and a non-null `paidDate` whenever `status` is
 * `PAID` - `upsertInvoiceAction` used to hand the constraint whatever the
 * form sent (usually `paidMinor: 0`, since the milestone form has no paid-
 * amount field at all), and Postgres rejected the write with a raw,
 * unhandled error surfaced to the user as "Something went wrong on our
 * side." Setting status to PAID directly (rather than through
 * `recordPaymentAction`) means "this was already paid in full," so the
 * action now fills in both fields itself.
 */
describe('upsertInvoiceAction sets status to PAID without crashing', () => {
  let pm: TestUser;
  let projectCode: string;
  let projectId: string;

  beforeAll(async () => {
    pm = await createTestUser('AHN_PROJECT_MANAGER');
    const project = await createTestProject({ as: pm, ahnProjectManagerId: pm.id });
    projectCode = project.code;
    projectId = project.id;
    await signInAs(pm);
  });

  afterAll(async () => {
    await cleanupFixtures();
  });

  it('creating an invoice directly as PAID fills in paidMinor and paidDate', async () => {
    const result = await upsertInvoiceAction({
      code: projectCode,
      milestone: 'Deposit, already received',
      number: 'AHN-9001',
      amount: 1000,
      status: 'PAID',
      invoiceDate: '2026-01-01',
    });
    expect(result.ok).toBe(true);

    const invoice = await db.invoice.findFirstOrThrow({
      where: { projectId, milestone: 'Deposit, already received' },
    });
    expect(invoice.amountMinor).toBe(100_000);
    expect(invoice.paidMinor).toBe(100_000);
    expect(invoice.paidDate).not.toBeNull();
  });

  it('editing an existing invoice to PAID fills in paidMinor and paidDate', async () => {
    const created = await upsertInvoiceAction({
      code: projectCode,
      milestone: '70% of payment completed',
      number: 'AHN-9002',
      amount: 2450,
      status: 'NOT_INVOICED',
    });
    expect(created.ok).toBe(true);
    const invoice = await db.invoice.findFirstOrThrow({
      where: { projectId, milestone: '70% of payment completed' },
    });
    expect(invoice.paidMinor).toBe(0);

    const edited = await upsertInvoiceAction({
      code: projectCode,
      invoiceId: invoice.id,
      milestone: '70% of payment completed',
      number: 'AHN-9002',
      amount: 2450,
      status: 'PAID',
      invoiceDate: '2026-08-04',
      dueDate: '2026-09-30',
    });
    expect(edited.ok).toBe(true);

    const updated = await db.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(updated.status).toBe('PAID');
    expect(updated.paidMinor).toBe(245_000);
    expect(updated.paidDate).not.toBeNull();
  });

  it('editing a non-PAID field never touches an existing paid figure', async () => {
    const created = await upsertInvoiceAction({
      code: projectCode,
      milestone: 'Final milestone',
      number: 'AHN-9003',
      amount: 500,
      status: 'PAID',
      invoiceDate: '2026-02-01',
    });
    expect(created.ok).toBe(true);
    const invoice = await db.invoice.findFirstOrThrow({
      where: { projectId, milestone: 'Final milestone' },
    });
    expect(invoice.paidMinor).toBe(50_000);

    const renamed = await upsertInvoiceAction({
      code: projectCode,
      invoiceId: invoice.id,
      milestone: 'Final milestone (renamed)',
      number: 'AHN-9003',
      amount: 500,
      status: 'PAID',
      invoiceDate: '2026-02-01',
      notes: 'Just fixing the name.',
    });
    expect(renamed.ok).toBe(true);

    const updated = await db.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(updated.milestone).toBe('Final milestone (renamed)');
    expect(updated.paidMinor).toBe(50_000);
    expect(updated.paidDate?.getTime()).toBe(invoice.paidDate?.getTime());
  });
});
