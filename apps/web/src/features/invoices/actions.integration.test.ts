import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '@relay/db';
import {
  cleanupFixtures,
  createTestProject,
  createTestUser,
  signInAs,
  type TestUser,
} from '../../../test/fixtures';
import { recordPaymentAction, upsertInvoiceAction } from './actions';

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
