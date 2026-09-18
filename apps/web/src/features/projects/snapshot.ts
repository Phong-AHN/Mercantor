import {
  assessHealth,
  clock,
  computeProjectTime,
  DEFAULT_AGING_THRESHOLDS,
  type AgingThresholds,
  type BlockerSegmentInput,
  type HealthVerdict,
  type InvoiceStatus,
  type ProjectTime,
  type StageSegmentInput,
  type Team,
} from '@relay/core';
import type { Approval, Blocker, BlockerOwnership, Invoice, Issue, StageEvent } from '@relay/db';

/**
 * Turns raw rows into the numbers every screen asks for. Kept in one place so
 * the list, the detail page, the dashboard and the worker all compute health
 * and elapsed time the same way - the alternative is three subtly different
 * answers to "how long has this been running".
 */

export interface InvoiceRollup {
  status: InvoiceStatus;
  totalMinor: number;
  invoicedMinor: number;
  paidMinor: number;
  outstandingMinor: number;
  /**
   * The slice of `outstandingMinor` with no invoice row behind it at all -
   * `totalMinor - invoicedMinor`, floored at 0. This is what makes
   * `outstandingMinor` look unexplained next to a milestone table where
   * every row is paid in full: that table only ever has a row for money
   * that was actually billed, so a contract's never-invoiced remainder is
   * real money owed with nowhere on the screen to show it. Surfaced
   * separately so a reader isn't left to guess where the gap went.
   */
  notInvoicedMinor: number;
  /** Sum of `amountMinor - paidMinor` over invoices individually overdue -
   * a concrete figure alongside the `overdue` flag below, which only says
   * yes/no. */
  overdueMinor: number;
  currency: string;
  nextDueDate: Date | null;
  overdue: boolean;
  count: number;
}

export function rollUpInvoices(
  invoices: readonly Pick<
    Invoice,
    'status' | 'amountMinor' | 'paidMinor' | 'currency' | 'dueDate'
  >[],
  contractTotalMinor: number,
  fallbackCurrency: string,
  now: Date = clock.now(),
): InvoiceRollup {
  const currency = invoices[0]?.currency ?? fallbackCurrency;
  const invoicedMinor = invoices
    .filter((invoice) => invoice.status !== 'NOT_INVOICED')
    .reduce((sum, invoice) => sum + invoice.amountMinor, 0);
  const paidMinor = invoices.reduce((sum, invoice) => sum + invoice.paidMinor, 0);

  const isOverdue = (invoice: (typeof invoices)[number]) =>
    invoice.status === 'OVERDUE' ||
    (invoice.dueDate !== null &&
      invoice.dueDate.getTime() < now.getTime() &&
      invoice.paidMinor < invoice.amountMinor &&
      invoice.status !== 'NOT_INVOICED');
  const overdue = invoices.some(isOverdue);
  const overdueMinor = invoices
    .filter(isOverdue)
    .reduce((sum, invoice) => sum + (invoice.amountMinor - invoice.paidMinor), 0);

  const nextDueDate =
    invoices
      .filter((invoice) => invoice.dueDate && invoice.paidMinor < invoice.amountMinor)
      .map((invoice) => invoice.dueDate as Date)
      .sort((a, b) => a.getTime() - b.getTime())[0] ?? null;

  // The rollup status is derived from the money, not from any one row: a
  // project with one paid and one unpaid milestone is partially paid.
  const totalMinor = Math.max(contractTotalMinor, invoicedMinor);
  let status: InvoiceStatus;
  if (overdue) status = 'OVERDUE';
  else if (invoicedMinor === 0) status = 'NOT_INVOICED';
  else if (paidMinor >= invoicedMinor && invoicedMinor > 0) status = 'PAID';
  else if (paidMinor > 0) status = 'PARTIALLY_PAID';
  else status = 'INVOICE_SENT';

  return {
    status,
    totalMinor,
    invoicedMinor,
    paidMinor,
    // Against the contract, not just what happened to be invoiced so far -
    // `invoicedMinor - paidMinor` reads as "$0 outstanding" the moment the
    // one milestone actually billed is paid in full, even with most of the
    // contract never invoiced at all yet (PRJ-0008: $1,400 of a $2,000
    // contract billed and paid, "$0 outstanding" shown - the merchant still
    // owes $600). `totalMinor` is already `max(contractTotalMinor,
    // invoicedMinor)`, so this is exactly Bryan's own formula: "contract
    // value - paid = outstanding balance".
    outstandingMinor: Math.max(0, totalMinor - paidMinor),
    notInvoicedMinor: Math.max(0, totalMinor - invoicedMinor),
    overdueMinor,
    currency,
    nextDueDate,
    overdue,
    count: invoices.length,
  };
}

export interface PortfolioInvoiceRollup {
  invoicedMinor: number;
  paidMinor: number;
  outstandingMinor: number;
  /** Sum of each project's own `notInvoicedMinor` - see `InvoiceRollup` for
   * why this needs to be visible on its own, not just implied by
   * `outstandingMinor`. */
  notInvoicedMinor: number;
  overdueMinor: number;
}

/**
 * The portfolio-wide Invoices page's own totals, across every project a
 * principal can see - `invoicedMinor`/`paidMinor` are still a flat sum (sums
 * are associative, so summing every row directly or summing each project's
 * own total comes out the same either way), but `outstandingMinor` is not:
 * it has to be each project's own balance against *its* contract, summed,
 * not `invoicedMinor - paidMinor` over the flat list. That flat subtraction
 * is exactly the bug `rollUpInvoices` above was fixed for - grouping by
 * project and reusing that same function here is what keeps this page from
 * quietly making the same mistake one level up.
 */
export function rollUpPortfolioInvoices(
  invoices: readonly (Pick<Invoice, 'status' | 'amountMinor' | 'paidMinor' | 'currency' | 'dueDate'> & {
    projectId: string;
    projectContractTotalMinor: number;
  })[],
  now: Date = clock.now(),
): PortfolioInvoiceRollup {
  const invoicedMinor = invoices
    .filter((invoice) => invoice.status !== 'NOT_INVOICED')
    .reduce((sum, invoice) => sum + invoice.amountMinor, 0);
  const paidMinor = invoices.reduce((sum, invoice) => sum + invoice.paidMinor, 0);

  const byProject = new Map<string, typeof invoices[number][]>();
  for (const invoice of invoices) {
    const group = byProject.get(invoice.projectId) ?? [];
    group.push(invoice);
    byProject.set(invoice.projectId, group);
  }
  const perProjectRollups = [...byProject.values()].map((group) =>
    rollUpInvoices(group, group[0]!.projectContractTotalMinor, group[0]!.currency, now),
  );
  const outstandingMinor = perProjectRollups.reduce((sum, rollup) => sum + rollup.outstandingMinor, 0);
  const notInvoicedMinor = perProjectRollups.reduce((sum, rollup) => sum + rollup.notInvoicedMinor, 0);
  // Overdue-ness is a per-invoice-row fact (unlike outstanding, it never
  // needs the project's contract to make sense), so a flat sum is exactly
  // right here - no grouping needed.
  const overdueMinor = perProjectRollups.reduce((sum, rollup) => sum + rollup.overdueMinor, 0);

  return { invoicedMinor, paidMinor, outstandingMinor, notInvoicedMinor, overdueMinor };
}

export function toStageSegments(
  events: readonly Pick<StageEvent, 'stage' | 'enteredAt' | 'exitedAt' | 'ownerTeam'>[],
): StageSegmentInput[] {
  return events.map((event) => ({
    stage: event.stage,
    enteredAt: event.enteredAt,
    exitedAt: event.exitedAt,
    ownerTeam: event.ownerTeam as Team | null,
  }));
}

export function toBlockerSegments(
  ownerships: readonly Pick<
    BlockerOwnership,
    'blockerId' | 'ownerTeam' | 'startedAt' | 'endedAt'
  >[],
): BlockerSegmentInput[] {
  return ownerships.map((ownership) => ({
    blockerId: ownership.blockerId,
    ownerTeam: ownership.ownerTeam as Team,
    startedAt: ownership.startedAt,
    endedAt: ownership.endedAt,
  }));
}

export interface SnapshotInput {
  startDate: Date;
  targetLaunchDate: Date | null;
  completedAt: Date | null;
  lastActivityAt: Date;
  stage: Pick<StageEvent, 'stage'>['stage'];
  stageEvents: readonly Pick<StageEvent, 'stage' | 'enteredAt' | 'exitedAt' | 'ownerTeam'>[];
  blockerOwnerships: readonly Pick<
    BlockerOwnership,
    'blockerId' | 'ownerTeam' | 'startedAt' | 'endedAt'
  >[];
  openBlockers: readonly Pick<Blocker, 'id' | 'title' | 'ownerTeam' | 'startedAt' | 'category'>[];
  issues: readonly Pick<Issue, 'severity' | 'status'>[];
  invoices: readonly Pick<
    Invoice,
    'status' | 'amountMinor' | 'paidMinor' | 'currency' | 'dueDate'
  >[];
  contractTotalMinor: number;
  currency: string;
  approvals?: readonly Pick<Approval, 'type' | 'status'>[];
  thresholds?: AgingThresholds;
  now?: Date;
}

export interface ProjectSnapshot {
  time: ProjectTime;
  health: HealthVerdict;
  invoice: InvoiceRollup;
  openIssueCount: number;
  launchBlockerCount: number;
  visitedStages: SnapshotInput['stage'][];
  stageDurations: Partial<Record<SnapshotInput['stage'], number>>;
}

const OPEN_ISSUE_STATUSES = new Set(['OPEN', 'IN_PROGRESS', 'WAITING_ON_OTHERS']);

export function buildSnapshot(input: SnapshotInput): ProjectSnapshot {
  const now = input.now ?? clock.now();

  const time = computeProjectTime({
    startedAt: input.startDate,
    targetLaunchDate: input.targetLaunchDate,
    completedAt: input.completedAt,
    stageSegments: toStageSegments(input.stageEvents),
    blockerSegments: toBlockerSegments(input.blockerOwnerships),
    lastActivityAt: input.lastActivityAt,
    thresholds: input.thresholds ?? DEFAULT_AGING_THRESHOLDS,
    now,
  });

  const invoice = rollUpInvoices(input.invoices, input.contractTotalMinor, input.currency, now);

  const openIssues = input.issues.filter((issue) => OPEN_ISSUE_STATUSES.has(issue.status));
  const health = assessHealth({
    stage: input.stage,
    time,
    openBlockerCount: input.openBlockers.length,
    openIssues: input.issues,
    overdueInvoice: invoice.overdue,
  });

  const stageDurations: Partial<Record<SnapshotInput['stage'], number>> = {};
  for (const entry of time.byStage) stageDurations[entry.stage] = entry.totalMs;

  return {
    time,
    health,
    invoice,
    openIssueCount: openIssues.length,
    launchBlockerCount: openIssues.filter((issue) => issue.severity === 'LAUNCH_BLOCKER').length,
    visitedStages: [...new Set(input.stageEvents.map((event) => event.stage))],
    stageDurations,
  };
}
