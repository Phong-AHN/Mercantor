import { formatDate, formatDays, formatDuration } from './format';
import type {
  ApprovalStatus,
  InvoiceStatus,
  IssueSeverity,
  IssueStatus,
  ProjectStage,
  Team,
} from './enums';
import { HEALTH_LABEL, TEAM_LABEL, type Tone } from './labels';
import { DAY_MS, type ProjectTime } from './sla';
import { LINEAR_STAGES, STAGES } from './stages';
import type { HealthVerdict } from './health';

/**
 * The brief's core product principle, expressed as code: ten questions SHOPLINE
 * must be able to answer from one screen. Rendering these as a strip rather
 * than as prose is what keeps the answer honest - every one is computed, none
 * is typed in.
 */
export type AnswerId =
  | 'where'
  | 'running'
  | 'stage-duration'
  | 'next-owner'
  | 'waiting-for'
  | 'delay-owner'
  | 'launch-blockers'
  | 'merchant-approved'
  | 'ahn-paid'
  | 'shopline-ready';

export interface Answer {
  id: AnswerId;
  question: string;
  /** Short enough for a tile. */
  value: string;
  /** One line of supporting fact. */
  detail: string;
  tone: Tone;
  /** Where clicking the tile should take the reader. */
  href?: string;
}

export interface AnswerInput {
  stage: ProjectStage;
  time: ProjectTime;
  health: HealthVerdict;
  nextAction: string | null;
  nextActionOwnerName: string | null;
  nextActionOwnerTeam: Team | null;
  nextActionDueDate: Date | null;
  openBlocker: {
    title: string;
    ownerTeam: Team;
    ownerName: string | null;
    startedAt: Date;
  } | null;
  openIssues: readonly { severity: IssueSeverity; status: IssueStatus; title: string }[];
  approvals: Partial<
    Record<'DESIGN' | 'QA' | 'MERCHANT_FINAL' | 'SHOPLINE_DEPLOYMENT', ApprovalStatus>
  >;
  invoice: {
    status: InvoiceStatus;
    totalMinor: number;
    paidMinor: number;
    outstandingMinor: number;
    currency: string;
    nextDueDate: Date | null;
  };
  /** Slug or id used to build tab links. */
  projectHref?: string;
}

const OPEN_ISSUE_STATUSES: readonly IssueStatus[] = ['OPEN', 'IN_PROGRESS', 'WAITING_ON_OTHERS'];

/** Rough forecast: remaining target dwell time for the stages still ahead. */
export function projectedShoplineReadyDate(stage: ProjectStage, from: Date): Date | null {
  const descriptor = STAGES[stage];
  if (descriptor.order === null) return null;
  if (descriptor.order >= (STAGES.READY_FOR_SHOPLINE_REVIEW.order ?? 0)) return from;

  const remaining = LINEAR_STAGES.filter((candidate) => {
    const order = STAGES[candidate].order ?? 0;
    return order >= descriptor.order! && order <= (STAGES.READY_FOR_SHOPLINE_REVIEW.order ?? 0);
  }).reduce((sum, candidate) => sum + (STAGES[candidate].targetDays ?? 0), 0);

  return new Date(from.getTime() + remaining * DAY_MS);
}

export function buildAnswers(input: AnswerInput): Answer[] {
  const base = input.projectHref ?? '';
  const descriptor = STAGES[input.stage];

  const launchBlockers = input.openIssues.filter(
    (issue) => issue.severity === 'LAUNCH_BLOCKER' && OPEN_ISSUE_STATUSES.includes(issue.status),
  );

  const delayOwner: Team = input.openBlocker?.ownerTeam ?? descriptor.ownerTeam;
  const merchantApproval = input.approvals.MERCHANT_FINAL ?? 'NOT_REQUESTED';
  const designApproval = input.approvals.DESIGN ?? 'NOT_REQUESTED';

  const readyDate = projectedShoplineReadyDate(input.stage, input.time.now);

  return [
    {
      id: 'where',
      question: 'Where is this project?',
      value: descriptor.label,
      detail: `${descriptor.phase === 'OFF_TRACK' ? 'Off the linear track' : `Step ${descriptor.order} of ${LINEAR_STAGES.length}`} - ${HEALTH_LABEL[input.health.health].label}`,
      tone: HEALTH_LABEL[input.health.health].tone,
      href: `${base}#timeline`,
    },
    {
      id: 'running',
      question: 'How long has it been running?',
      value: formatDuration(input.time.ageMs, { compact: true }),
      detail: `Started ${formatDate(input.time.startedAt)}${
        input.time.targetLaunchDate ? ` - target ${formatDate(input.time.targetLaunchDate)}` : ''
      }`,
      tone:
        input.time.agingBand === 'CRITICAL'
          ? 'danger'
          : input.time.agingBand === 'DELAYED'
            ? 'warning'
            : input.time.agingBand === 'ATTENTION'
              ? 'info'
              : 'success',
      href: `${base}#time`,
    },
    {
      id: 'stage-duration',
      question: 'How long in the current stage?',
      value: formatDuration(input.time.currentStageMs, { compact: true }),
      detail:
        input.time.currentStageTargetMs === null
          ? 'No target set for this stage'
          : `Target ${formatDuration(input.time.currentStageTargetMs, { compact: true })}${
              input.time.currentStageOverTarget ? ' - over' : ''
            }`,
      tone: input.time.currentStageOverTarget ? 'warning' : 'success',
      href: `${base}#time`,
    },
    {
      id: 'next-owner',
      question: 'Who owns the next step?',
      value: input.nextActionOwnerName ?? TEAM_LABEL[input.nextActionOwnerTeam ?? delayOwner].label,
      detail: input.nextActionDueDate
        ? `Due ${formatDate(input.nextActionDueDate)}`
        : `${TEAM_LABEL[input.nextActionOwnerTeam ?? delayOwner].label} - no due date set`,
      tone: TEAM_LABEL[input.nextActionOwnerTeam ?? delayOwner].tone,
      href: `${base}#next-action`,
    },
    {
      id: 'waiting-for',
      question: 'What are we waiting for?',
      value: input.openBlocker?.title ?? input.nextAction ?? 'Nothing - work in progress',
      detail: input.openBlocker
        ? `Blocked for ${formatDuration(input.time.now.getTime() - input.openBlocker.startedAt.getTime(), { compact: true })}`
        : descriptor.description,
      tone: input.openBlocker ? 'danger' : 'success',
      href: `${base}#blockers`,
    },
    {
      id: 'delay-owner',
      question: 'Who owns the current delay?',
      value: TEAM_LABEL[delayOwner].label,
      detail: `${input.time.byTeamPercent.AHN}% AHN / ${input.time.byTeamPercent.MERCHANT}% merchant / ${input.time.byTeamPercent.SHOPLINE}% SHOPLINE of elapsed time`,
      tone: TEAM_LABEL[delayOwner].tone,
      href: `${base}#time`,
    },
    {
      id: 'launch-blockers',
      question: 'Is anything blocking launch?',
      value:
        launchBlockers.length === 0
          ? 'No'
          : `${launchBlockers.length} launch blocker${launchBlockers.length === 1 ? '' : 's'}`,
      detail: launchBlockers[0]?.title ?? 'No launch-blocking issues open.',
      tone: launchBlockers.length === 0 ? 'success' : 'danger',
      href: `${base}#issues`,
    },
    {
      id: 'merchant-approved',
      question: 'Has the merchant approved it?',
      value:
        merchantApproval === 'APPROVED'
          ? 'Yes - final approval'
          : designApproval === 'APPROVED'
            ? 'Design only'
            : 'Not yet',
      detail:
        merchantApproval === 'APPROVED'
          ? 'Final merchant sign-off recorded.'
          : `Design ${designApproval.toLowerCase().replace(/_/g, ' ')}, final approval ${merchantApproval
              .toLowerCase()
              .replace(/_/g, ' ')}.`,
      tone:
        merchantApproval === 'APPROVED'
          ? 'success'
          : designApproval === 'APPROVED'
            ? 'info'
            : 'warning',
      href: `${base}#approvals`,
    },
    {
      id: 'ahn-paid',
      question: 'Has AHN been paid?',
      value:
        input.invoice.status === 'PAID'
          ? 'Paid in full'
          : input.invoice.status === 'NOT_INVOICED'
            ? 'Not invoiced'
            : input.invoice.status === 'OVERDUE'
              ? 'Overdue'
              : `${Math.round((input.invoice.paidMinor / Math.max(1, input.invoice.totalMinor)) * 100)}% paid`,
      detail:
        input.invoice.outstandingMinor > 0
          ? `${(input.invoice.outstandingMinor / 100).toLocaleString('en-US', { style: 'currency', currency: input.invoice.currency })} outstanding${
              input.invoice.nextDueDate ? `, due ${formatDate(input.invoice.nextDueDate)}` : ''
            }`
          : 'Nothing outstanding.',
      tone:
        input.invoice.status === 'PAID'
          ? 'success'
          : input.invoice.status === 'OVERDUE'
            ? 'danger'
            : input.invoice.status === 'NOT_INVOICED'
              ? 'muted'
              : 'warning',
      href: `${base}#invoices`,
    },
    {
      id: 'shopline-ready',
      question: 'When will it be ready for SHOPLINE?',
      value: readyDate ? formatDate(readyDate) : 'Already there',
      detail:
        input.time.daysToTarget === null
          ? 'No target launch date set.'
          : input.time.daysToTarget >= 0
            ? `${formatDays(input.time.daysToTarget)} of slack against target launch.`
            : `${formatDays(input.time.daysToTarget)} past target launch.`,
      tone: input.time.onSchedule === false ? 'danger' : 'info',
      href: `${base}#handoff`,
    },
  ];
}
