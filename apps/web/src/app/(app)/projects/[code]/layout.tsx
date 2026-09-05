import { notFound } from 'next/navigation';
import { ExternalLink, Store } from 'lucide-react';
import { formatDate, formatDuration, isAppError, TEAM_LABEL, type Answer } from '@relay/core';
import { can, writableVisibilities } from '@relay/rbac';
import {
  AnswerTile,
  Badge,
  BlockerBanner,
  Breadcrumbs,
  Mono,
  PageHeader,
  type TabItem,
} from '@relay/ui';
import { HealthPill, MigrationTypePill, StagePill } from '@/components/domain';
import { answerHref, answersForProject } from '@/features/projects/answers';
import { getProject } from '@/features/projects/queries';
import { requirePrincipalOrRedirect } from '@/server/session';
import { ProjectActions } from './project-actions';
import { ProjectTabs } from './project-tabs';

/**
 * The project shell. Everything above the tabs is the "one screen" the brief
 * asks for: the blocker if there is one, then the ten answers, then the way in
 * to the detail. A reader should not have to click to know where things stand.
 */
export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const principal = await requirePrincipalOrRedirect(`/projects/${code}`);

  let project: Awaited<ReturnType<typeof getProject>>;
  try {
    project = await getProject(principal, code);
  } catch (error) {
    if (isAppError(error) && error.code === 'NOT_FOUND') notFound();
    throw error;
  }

  const answers = answersForProject(project);
  const openBlocker = project.blockers.find((blocker) => blocker.resolvedAt === null);
  const now = project.snapshot.time.now;

  const openIssues = project.issues.filter(
    (issue) => !['RESOLVED', 'WONT_FIX'].includes(issue.status),
  );
  const pendingApprovals = project.approvals.filter(
    (approval) => approval.status === 'PENDING',
  ).length;
  const outstandingAccess = project.accessItems.filter((item) => item.status !== 'VERIFIED').length;
  const outstandingAssets = project.assetItems.filter(
    (item) => item.required && item.status !== 'APPROVED',
  ).length;

  const base = `/projects/${project.code}`;
  const tabs: TabItem[] = [
    { href: base, label: 'Overview' },
    { href: `${base}/time`, label: 'Time & SLA' },
    { href: `${base}/scope`, label: 'Scope', count: project.scopeItems.length },
    { href: `${base}/access`, label: 'Access', count: outstandingAccess },
    { href: `${base}/assets`, label: 'Assets', count: outstandingAssets },
    { href: `${base}/activity`, label: 'Activity', count: project.comments.length },
    {
      href: `${base}/blockers`,
      label: 'Blockers',
      count: project.blockers.filter((blocker) => blocker.resolvedAt === null).length,
      alert: Boolean(openBlocker),
    },
    {
      href: `${base}/issues`,
      label: 'Issues',
      count: openIssues.length,
      alert: openIssues.some((issue) => issue.severity === 'LAUNCH_BLOCKER'),
    },
    { href: `${base}/approvals`, label: 'Approvals', count: pendingApprovals },
    ...(can(principal, 'invoice:read')
      ? [{ href: `${base}/invoices`, label: 'Invoices', alert: project.snapshot.invoice.overdue }]
      : []),
    { href: `${base}/handoff`, label: 'SHOPLINE handoff' },
    { href: `${base}/timeline`, label: 'Timeline' },
    ...(can(principal, 'project:update') ? [{ href: `${base}/settings`, label: 'Settings' }] : []),
  ];

  return (
    <div className="space-y-5">
      <Breadcrumbs
        items={[{ label: 'Projects', href: '/projects' }, { label: project.merchant.name }]}
      />

      <PageHeader
        eyebrow={
          <>
            <Mono>{project.code}</Mono>
            <span className="text-faint">&middot;</span>
            <span>Started {formatDate(project.startDate)}</span>
            <span className="text-faint">&middot;</span>
            <span className="tabular">
              {formatDuration(project.snapshot.time.ageMs, { compact: true })} old
            </span>
          </>
        }
        title={project.merchant.name}
        meta={
          <>
            <StagePill stage={project.stage} showPhase />
            <HealthPill
              health={project.snapshot.health.health}
              reason={project.snapshot.health.reasons.join(' ')}
            />
            <MigrationTypePill type={project.migrationType} />
            {project.merchantDetail.currentPlatform && (
              <Badge tone="muted" size="md">
                from {project.merchantDetail.currentPlatform}
              </Badge>
            )}
            {project.merchantDetail.shoplineStoreId && (
              <span className="text-muted inline-flex items-center gap-1.5 text-[12px]">
                <Store className="size-3.5" />
                {project.merchantDetail.shoplineStoreId}
              </span>
            )}
            {project.merchant.website && (
              <a
                href={project.merchant.website}
                target="_blank"
                rel="noreferrer noopener"
                className="text-accent-ink inline-flex items-center gap-1 text-[12px] underline-offset-4 hover:underline"
              >
                {project.merchant.website.replace(/^https?:\/\//, '')}
                <ExternalLink className="size-3" />
              </a>
            )}
          </>
        }
        actions={
          <ProjectActions
            code={project.code}
            stage={project.stage}
            merchantName={project.merchant.name}
            writableVisibilities={writableVisibilities(principal)}
            introductionSent={project.introEmails.some((email) => email.status !== 'DRAFT')}
            permissions={{
              advanceStage: can(principal, 'project:advance_stage'),
              comment: can(principal, 'comment:create'),
              sendIntroduction: can(principal, 'introduction:send'),
              submitHandoff: can(principal, 'handoff:submit'),
            }}
          />
        }
      />

      {openBlocker && (
        <BlockerBanner
          title={openBlocker.title}
          owner={openBlocker.owner?.name ?? TEAM_LABEL[openBlocker.ownerTeam].label}
          duration={formatDuration(now.getTime() - openBlocker.startedAt.getTime(), {
            compact: true,
          })}
          nextAction={openBlocker.nextAction}
          dueDate={openBlocker.dueDate ? formatDate(openBlocker.dueDate) : null}
          href={`${base}/blockers`}
        />
      )}

      <AnswerStrip answers={answers} code={project.code} />

      <ProjectTabs items={tabs} base={base} />

      <div className="pt-1">{children}</div>
    </div>
  );
}

/**
 * The ten questions, always in the same order, always answered. This is the
 * component the core product principle is written into.
 */
function AnswerStrip({ answers, code }: { answers: Answer[]; code: string }) {
  return (
    <section aria-label="Project status at a glance">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {answers.map((answer) => (
          <AnswerTile
            key={answer.id}
            question={answer.question}
            value={answer.value}
            detail={answer.detail}
            tone={answer.tone}
            href={answerHref(code, answer.id)}
          />
        ))}
      </div>
    </section>
  );
}

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return { title: code };
}
