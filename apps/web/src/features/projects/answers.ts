import 'server-only';
import { buildAnswers, type Answer, type ApprovalStatus } from '@relay/core';
import type { ProjectDetail } from './queries';

/**
 * Maps a loaded project onto the ten questions the brief says one screen must
 * answer. Doing it here rather than in the page keeps the questions in one
 * place, so the merchant portal and the internal view cannot drift apart.
 */
export function answersForProject(project: ProjectDetail): Answer[] {
  const openBlocker = project.blockers.find((blocker) => blocker.resolvedAt === null) ?? null;

  const approvals: Partial<
    Record<'DESIGN' | 'QA' | 'MERCHANT_FINAL' | 'SHOPLINE_DEPLOYMENT', ApprovalStatus>
  > = {};
  for (const approval of project.approvals) {
    if (
      approval.type === 'DESIGN' ||
      approval.type === 'QA' ||
      approval.type === 'MERCHANT_FINAL' ||
      approval.type === 'SHOPLINE_DEPLOYMENT'
    ) {
      approvals[approval.type] = approval.status;
    }
  }

  return buildAnswers({
    stage: project.stage,
    time: project.snapshot.time,
    health: project.snapshot.health,
    nextAction: project.nextAction,
    nextActionOwnerName: project.nextActionOwner?.name ?? null,
    nextActionOwnerTeam: project.nextActionOwnerTeam,
    nextActionDueDate: project.nextActionDueDate,
    openBlocker: openBlocker
      ? {
          title: openBlocker.title,
          ownerTeam: openBlocker.ownerTeam,
          ownerName: openBlocker.owner?.name ?? null,
          startedAt: openBlocker.startedAt,
        }
      : null,
    openIssues: project.issues.map((issue) => ({
      severity: issue.severity,
      status: issue.status,
      title: issue.title,
    })),
    approvals,
    invoice: {
      status: project.snapshot.invoice.status,
      totalMinor: project.snapshot.invoice.totalMinor,
      paidMinor: project.snapshot.invoice.paidMinor,
      outstandingMinor: project.snapshot.invoice.outstandingMinor,
      currency: project.snapshot.invoice.currency,
      nextDueDate: project.snapshot.invoice.nextDueDate,
    },
    projectHref: `/projects/${project.code}`,
  });
}

/**
 * The answer tiles link into tabs, so the hrefs `@relay/core` builds with `#`
 * fragments are rewritten to real routes here - one place, rather than a
 * special case per tile.
 */
const TAB_FOR_ANSWER: Record<string, string> = {
  where: '',
  running: '/time',
  'stage-duration': '/time',
  'next-owner': '',
  'waiting-for': '/blockers',
  'delay-owner': '/time',
  'launch-blockers': '/issues',
  'merchant-approved': '/approvals',
  'ahn-paid': '/invoices',
  'shopline-ready': '/handoff',
};

export function answerHref(code: string, answerId: string): string {
  return `/projects/${code}${TAB_FOR_ANSWER[answerId] ?? ''}`;
}
