import { describe, expect, it } from 'vitest';
import { rollUpInvoices } from './snapshot';

const NOW = new Date('2026-09-17T00:00:00.000Z');

function invoice(overrides: {
  status?: 'NOT_INVOICED' | 'INVOICE_SENT' | 'PARTIALLY_PAID' | 'PAID' | 'OVERDUE';
  amountMinor: number;
  paidMinor: number;
  currency?: string;
  dueDate?: Date | null;
}) {
  return {
    status: overrides.status ?? 'PAID',
    amountMinor: overrides.amountMinor,
    paidMinor: overrides.paidMinor,
    currency: overrides.currency ?? 'USD',
    dueDate: overrides.dueDate ?? null,
  };
}

/**
 * Regression: PRJ-0008 showed "$0 outstanding" with a $2,000 contract and
 * only $1,400 ever paid - because the old formula measured outstanding
 * against what happened to be invoiced so far (`invoicedMinor - paidMinor`),
 * not the contract. The one milestone actually billed ($1,400) was paid in
 * full, so that math came out to zero, even though $600 of the $2,000
 * contract had never been invoiced at all. Bryan's own stated formula
 * ("contract value - paid = outstanding balance") is what `totalMinor -
 * paidMinor` computes instead.
 */
describe('rollUpInvoices - outstanding is against the contract, not just what has been invoiced', () => {
  it('reproduces and fixes the PRJ-0008 case: one milestone fully paid, most of the contract never invoiced', () => {
    const rollup = rollUpInvoices(
      [invoice({ status: 'PAID', amountMinor: 140_000, paidMinor: 140_000 })],
      200_000,
      'USD',
      NOW,
    );

    expect(rollup.invoicedMinor).toBe(140_000);
    expect(rollup.paidMinor).toBe(140_000);
    expect(rollup.totalMinor).toBe(200_000);
    expect(rollup.outstandingMinor).toBe(60_000);
  });

  it('is zero once every milestone that will ever be invoiced is paid and nothing more is owed', () => {
    const rollup = rollUpInvoices(
      [invoice({ status: 'PAID', amountMinor: 200_000, paidMinor: 200_000 })],
      200_000,
      'USD',
      NOW,
    );
    expect(rollup.outstandingMinor).toBe(0);
  });

  it('recomputes correctly after an invoice is deleted - the second milestone alone decides it', () => {
    const beforeDelete = rollUpInvoices(
      [
        invoice({ status: 'PAID', amountMinor: 140_000, paidMinor: 140_000 }),
        invoice({ status: 'INVOICE_SENT', amountMinor: 60_000, paidMinor: 0 }),
      ],
      200_000,
      'USD',
      NOW,
    );
    expect(beforeDelete.outstandingMinor).toBe(60_000);

    // Deleting the second (unpaid, never-invoiced-for-real) milestone -
    // rollUpInvoices only ever sees whatever rows still exist.
    const afterDelete = rollUpInvoices(
      [invoice({ status: 'PAID', amountMinor: 140_000, paidMinor: 140_000 })],
      200_000,
      'USD',
      NOW,
    );
    expect(afterDelete.outstandingMinor).toBe(60_000);
    expect(afterDelete.count).toBe(1);
  });

  it('never goes negative, even if paid exceeds a contract total that was later lowered', () => {
    const rollup = rollUpInvoices(
      [invoice({ status: 'PAID', amountMinor: 200_000, paidMinor: 200_000 })],
      150_000,
      'USD',
      NOW,
    );
    // totalMinor still floors at invoicedMinor (200_000), so this never
    // reports a negative "still owed" figure.
    expect(rollup.outstandingMinor).toBe(0);
  });

  it('counts an invoiced-but-unpaid contract balance as fully outstanding, same as before', () => {
    const rollup = rollUpInvoices([], 200_000, 'USD', NOW);
    expect(rollup.invoicedMinor).toBe(0);
    expect(rollup.paidMinor).toBe(0);
    expect(rollup.outstandingMinor).toBe(200_000);
  });
});
