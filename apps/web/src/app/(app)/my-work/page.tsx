import type { Metadata } from 'next';
import Link from 'next/link';
import { AtSign, BadgeCheck, Bug, FolderKanban, OctagonAlert } from 'lucide-react';
import {
  APPROVAL_TYPE_LABEL,
  formatDuration,
  formatRelative,
  ISSUE_SEVERITY_LABEL,
  TEAM_LABEL,
} from '@relay/core';
import { Card, CardHeader, Empty, Mono, PageHeader, Stat, StatusPill } from '@relay/ui';
import { DueDate, HealthPill, ProjectLink, StagePill } from '@/components/domain';
import { getMyWork } from '@/features/workspace/queries';
import { requirePrincipalOrRedirect } from '@/server/session';

export const metadata: Metadata = { title: 'My work' };
export const dynamic = 'force-dynamic';

/**
 * What is actually waiting on the person reading it. Deliberately narrow: a
 * dashboard shows the portfolio, this shows the four or five things somebody
 * could clear before lunch.
 */
export default async function MyWorkPage() {
  const principal = await requirePrincipalOrRedirect('/my-work');
  const work = await getMyWork(principal);
  const now = work.now;

  const total =
    work.nextActions.length + work.blockers.length + work.issues.length + work.approvals.length;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={<span>{TEAM_LABEL[principal.team].label}</span>}
        title={`Good to see you, ${principal.name.split(' ')[0]}`}
        description={
          total === 0
            ? 'Nothing is waiting on you right now.'
            : `${total} thing${total === 1 ? '' : 's'} are waiting on you across ${work.assignedProjects.length} project${work.assignedProjects.length === 1 ? '' : 's'}.`
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Your projects"
          value={work.assignedProjects.length}
          detail="Active and assigned to you"
          tone="accent"
          icon={<FolderKanban className="size-3.5" />}
        />
        <Stat
          label="Next steps you own"
          value={work.nextActions.length}
          detail="The project is waiting on you"
          tone={work.nextActions.length === 0 ? 'success' : 'warning'}
        />
        <Stat
          label="Blockers you own"
          value={work.blockers.length}
          detail="With the clock running"
          tone={work.blockers.length === 0 ? 'success' : 'danger'}
          icon={<OctagonAlert className="size-3.5" />}
        />
        <Stat
          label="Approvals for you"
          value={work.approvals.length}
          detail="Checkpoints only you can decide"
          tone={work.approvals.length === 0 ? 'success' : 'info'}
          icon={<BadgeCheck className="size-3.5" />}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Next steps you own"
            count={work.nextActions.length}
            description="Somebody wrote your name against the next move."
          />
          {work.nextActions.length === 0 ? (
            <Empty title="Nothing waiting on you" className="py-10" />
          ) : (
            <ul className="divide-line divide-y">
              {work.nextActions.map((project) => (
                <li key={project.id}>
                  <Link
                    href={`/projects/${project.code}`}
                    className="hover:bg-surface-2 flex items-start justify-between gap-4 px-5 py-3.5 transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-ink text-[13px] font-medium">{project.merchant.name}</p>
                      <p className="text-muted mt-0.5 line-clamp-2 text-[12.5px]">
                        {project.nextAction}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <StagePill stage={project.stage} size="sm" />
                      <div className="mt-1">
                        <DueDate date={project.nextActionDueDate} now={now} />
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Blockers with your name on them"
            count={work.blockers.length}
            description="The elapsed time is being charged to you until you hand it on or resolve it."
          />
          {work.blockers.length === 0 ? (
            <Empty title="You are not holding anything up" className="py-10" />
          ) : (
            <ul className="divide-line divide-y">
              {work.blockers.map((blocker) => (
                <li key={blocker.id}>
                  <Link
                    href={`/projects/${blocker.project.code}/blockers`}
                    className="hover:bg-surface-2 flex items-start justify-between gap-4 px-5 py-3.5 transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-ink text-[13px] font-medium">{blocker.title}</p>
                      <p className="text-muted mt-0.5 text-[12px]">
                        {blocker.project.merchant.name}
                        {blocker.nextAction ? ` - ${blocker.nextAction}` : ''}
                      </p>
                    </div>
                    <span className="tabular text-danger-ink shrink-0 text-[13px] font-semibold">
                      {formatDuration(now.getTime() - blocker.startedAt.getTime(), {
                        compact: true,
                      })}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Issues assigned to you"
            count={work.issues.length}
            icon={<Bug className="size-4" />}
          />
          {work.issues.length === 0 ? (
            <Empty title="No issues assigned" className="py-10" />
          ) : (
            <ul className="divide-line divide-y">
              {work.issues.map((issue) => (
                <li key={issue.id}>
                  <Link
                    href={`/projects/${issue.project.code}/issues`}
                    className="hover:bg-surface-2 flex items-start justify-between gap-4 px-5 py-3.5 transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-ink flex items-center gap-2 text-[13px] font-medium">
                        <Mono>{issue.reference}</Mono>
                        <span className="truncate">{issue.title}</span>
                      </p>
                      <p className="text-muted mt-0.5 text-[12px]">{issue.project.merchant.name}</p>
                    </div>
                    <StatusPill descriptor={ISSUE_SEVERITY_LABEL[issue.severity]} size="sm" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Waiting on your decision"
            count={work.approvals.length}
            icon={<BadgeCheck className="size-4" />}
          />
          {work.approvals.length === 0 ? (
            <Empty title="No approvals pending" className="py-10" />
          ) : (
            <ul className="divide-line divide-y">
              {work.approvals.map((approval) => (
                <li key={approval.id}>
                  <Link
                    href={`/projects/${approval.project.code}/approvals`}
                    className="hover:bg-surface-2 flex items-start justify-between gap-4 px-5 py-3.5 transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-ink text-[13px] font-medium">
                        {APPROVAL_TYPE_LABEL[approval.type].label}
                      </p>
                      <p className="text-muted mt-0.5 text-[12px]">
                        {approval.project.merchant.name}
                        {approval.requestedBy && ` - asked by ${approval.requestedBy.name}`}
                      </p>
                    </div>
                    {approval.requestedAt && (
                      <span className="text-faint shrink-0 text-[11.5px]">
                        {formatRelative(approval.requestedAt, now)}
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="You were mentioned"
            count={work.mentions.length}
            icon={<AtSign className="size-4" />}
          />
          {work.mentions.length === 0 ? (
            <Empty title="No mentions" className="py-10" />
          ) : (
            <ul className="divide-line divide-y">
              {work.mentions.map((mention) => (
                <li key={mention.id}>
                  <Link
                    href={`/projects/${mention.comment.project.code}/activity`}
                    className="hover:bg-surface-2 block px-5 py-3.5 transition-colors"
                  >
                    <p className="text-muted flex items-baseline justify-between gap-3 text-[12px]">
                      <span>
                        {mention.comment.author.name} on {mention.comment.project.merchant.name}
                      </span>
                      <span className="text-faint">
                        {formatRelative(mention.comment.createdAt, now)}
                      </span>
                    </p>
                    <p className="text-ink-soft mt-1 line-clamp-2 text-[13px] leading-5">
                      {mention.comment.body}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Your projects"
            count={work.assignedProjects.length}
            description="Everything you are named on, most recently active first."
          />
          {work.assignedProjects.length === 0 ? (
            <Empty title="You are not assigned to any project" className="py-10" />
          ) : (
            <ul className="divide-line divide-y">
              {work.assignedProjects.map((project) => (
                <li key={project.id}>
                  <Link
                    href={`/projects/${project.code}`}
                    className="hover:bg-surface-2 flex items-center justify-between gap-4 px-5 py-3 transition-colors"
                  >
                    <div className="min-w-0">
                      <ProjectLink
                        code={project.code}
                        name={project.merchant.name}
                        linked={false}
                      />
                      {project.currentBlocker && (
                        <p className="text-danger-ink mt-0.5 truncate text-[11.5px]">
                          {project.currentBlocker.title}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <StagePill stage={project.stage} size="sm" />
                      <HealthPill health={project.health} size="sm" />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
