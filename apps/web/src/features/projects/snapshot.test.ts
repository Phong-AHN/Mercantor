import { describe, expect, it } from 'vitest';
import { rollUpInvoices, rollUpPortfolioInvoices } from './snapshot';

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

/**
 * The portfolio-wide Invoices page (`app/(app)/invoices/page.tsx`) had its
 * own second copy of the same bug, one level up: it summed `amountMinor -
 * paidMinor` flat across every invoice row in the whole portfolio, which
 * undercounts exactly the same way `rollUpInvoices` used to for a single
 * project - just hidden inside a portfolio-wide total instead of a
 * per-project one. Fixed by grouping per project and reusing
 * `rollUpInvoices` for each group, rather than a third, independent
 * "outstanding" formula.
 */
describe('rollUpPortfolioInvoices - sums each project against its own contract', () => {
  it('reproduces the PRJ-0008 case at the portfolio level: fixing it project by project fixes the total', () => {
    const rollup = rollUpPortfolioInvoices(
      [
        {
          ...invoice({ status: 'PAID', amountMinor: 140_000, paidMinor: 140_000 }),
          projectId: 'prj-0008',
          projectContractTotalMinor: 200_000,
        },
      ],
      NOW,
    );

    expect(rollup.invoicedMinor).toBe(140_000);
    expect(rollup.paidMinor).toBe(140_000);
    expect(rollup.outstandingMinor).toBe(60_000);
  });

  it('never lets one project with money left on its contract get masked by another that is fully settled', () => {
    const rollup = rollUpPortfolioInvoices(
      [
        // Fully paid against its own $500 contract - contributes $0.
        {
          ...invoice({ status: 'PAID', amountMinor: 50_000, paidMinor: 50_000 }),
          projectId: 'project-a',
          projectContractTotalMinor: 50_000,
        },
        // $1,400 of a $2,000 contract billed and paid - $600 still owed,
        // same as PRJ-0008.
        {
          ...invoice({ status: 'PAID', amountMinor: 140_000, paidMinor: 140_000 }),
          projectId: 'project-b',
          projectContractTotalMinor: 200_000,
        },
      ],
      NOW,
    );

    expect(rollup.invoicedMinor).toBe(190_000);
    expect(rollup.paidMinor).toBe(190_000);
    // A flat `invoicedMinor - paidMinor` over these same two rows would read
    // $0 - exactly the bug being guarded against here.
    expect(rollup.outstandingMinor).toBe(60_000);
  });

  it('sums correctly across several milestones on the same project, not just one row per project', () => {
    const rollup = rollUpPortfolioInvoices(
      [
        {
          ...invoice({ status: 'PAID', amountMinor: 100_000, paidMinor: 100_000 }),
          projectId: 'project-a',
          projectContractTotalMinor: 300_000,
        },
        {
          ...invoice({ status: 'INVOICE_SENT', amountMinor: 100_000, paidMinor: 0 }),
          projectId: 'project-a',
          projectContractTotalMinor: 300_000,
        },
      ],
      NOW,
    );

    expect(rollup.invoicedMinor).toBe(200_000);
    expect(rollup.paidMinor).toBe(100_000);
    // $300,000 contract - $100,000 paid, not $200,000 invoiced - $100,000 paid.
    expect(rollup.outstandingMinor).toBe(200_000);
  });
});
