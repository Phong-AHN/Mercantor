import type { IssueSeverity, IssueStatus, ProjectHealth, ProjectStage } from './enums';
import { DEFAULT_INACTIVITY_DAYS, type ProjectTime } from './sla';

export interface HealthInput {
  stage: ProjectStage;
  time: ProjectTime;
  openBlockerCount: number;
  openIssues: readonly { severity: IssueSeverity; status: IssueStatus }[];
  overdueInvoice: boolean;
  inactivityDays?: number;
}

export interface HealthVerdict {
  health: ProjectHealth;
  /** Ordered, human-readable. The first reason is the headline on a card. */
  reasons: string[];
}

const OPEN_ISSUE_STATUSES: readonly IssueStatus[] = ['OPEN', 'IN_PROGRESS', 'WAITING_ON_OTHERS'];

/**
 * Health is derived, never typed in by hand. Storing it would let it drift from
 * the blockers and dates that justify it, and the whole point of the portal is
 * that the status on the screen is the status in reality.
 */
export function assessHealth(input: HealthInput): HealthVerdict {
  const reasons: string[] = [];
  const inactivityLimit = input.inactivityDays ?? DEFAULT_INACTIVITY_DAYS;

  if (input.stage === 'COMPLETED') {
    return { health: 'ON_TRACK', reasons: ['Project completed.'] };
  }

  const launchBlockers = input.openIssues.filter(
    (issue) => issue.severity === 'LAUNCH_BLOCKER' && OPEN_ISSUE_STATUSES.includes(issue.status),
  ).length;

  if (launchBlockers > 0) {
    reasons.push(`${launchBlockers} open launch blocker${launchBlockers === 1 ? '' : 's'}.`);
  }
  if (input.stage === 'ON_HOLD_BLOCKED') {
    reasons.push('Project is on hold.');
  }
  if (input.openBlockerCount > 0) {
    reasons.push(
      `${input.openBlockerCount} open blocker${input.openBlockerCount === 1 ? '' : 's'}.`,
    );
  }

  if (reasons.length > 0) {
    return { health: 'BLOCKED', reasons };
  }

  if (input.time.daysOverTarget > 0) {
    reasons.push(`${Math.floor(input.time.daysOverTarget)} days past target launch.`);
  }
  if (input.time.agingBand === 'DELAYED' || input.time.agingBand === 'CRITICAL') {
    reasons.push(`Project age is ${Math.floor(input.time.ageDays)} days.`);
  }
  if (input.time.currentStageOverTarget) {
    reasons.push('Current stage has run past its target duration.');
  }
  if (input.time.inactiveDays !== null && input.time.inactiveDays > inactivityLimit) {
    reasons.push(`No activity for ${Math.floor(input.time.inactiveDays)} days.`);
  }
  if (input.overdueInvoice) {
    reasons.push('An invoice is overdue.');
  }
  const highIssues = input.openIssues.filter(
    (issue) => issue.severity === 'HIGH' && OPEN_ISSUE_STATUSES.includes(issue.status),
  ).length;
  if (highIssues > 0) {
    reasons.push(`${highIssues} open high-severity issue${highIssues === 1 ? '' : 's'}.`);
  }

  if (reasons.length > 0) return { health: 'AT_RISK', reasons };

  return { health: 'ON_TRACK', reasons: ['No blockers, on schedule, active this week.'] };
}
