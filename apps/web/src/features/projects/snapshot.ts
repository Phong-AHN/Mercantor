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

  const overdue = invoices.some(
    (invoice) =>
      invoice.status === 'OVERDUE' ||
      (invoice.dueDate !== null &&
        invoice.dueDate.getTime() < now.getTime() &&
        invoice.paidMinor < invoice.amountMinor &&
        invoice.status !== 'NOT_INVOICED'),
  );

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
    outstandingMinor: Math.max(0, invoicedMinor - paidMinor),
    currency,
    nextDueDate,
    overdue,
    count: invoices.length,
  };
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
