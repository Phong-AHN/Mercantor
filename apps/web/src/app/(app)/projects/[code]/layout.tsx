import Link from 'next/link';
import { notFound } from 'next/navigation';
import { isAppError, OPEN_FINDING_STATUSES, type Answer } from '@relay/core';
import { db } from '@relay/db';
import { can, writableVisibilities } from '@relay/rbac';
import { AnswerTile, Breadcrumbs } from '@relay/ui';
import { answerHref, answersForProject } from '@/features/projects/answers';
import { unmetHandoffRequirements } from '@/features/projects/mutations';
import { getProject } from '@/features/projects/queries';
import { requirePrincipalOrRedirect } from '@/server/session';
import { ProjectActions } from './project-actions';
import { ProjectTabs, type ProjectTab } from './project-tabs';
import { ProjectHero } from './project-hero';
import { StatusBand } from './status-band';

/**
 * The project shell. Everything above the tabs is the "one screen" the brief
 * asks for: the status band (what happens next, is anything stuck, are we on
 * time), then the ten answers, then the way in to the detail. A reader should
 * not have to click to know where things stand.
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

  const answers = answersForProject(project, can(principal, 'invoice:read'));
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

  const openFindings = can(principal, 'qa:read')
    ? await db.finding.groupBy({
        by: ['severity'],
        where: { projectId: project.id, status: { in: [...OPEN_FINDING_STATUSES] } },
        _count: { _all: true },
      })
    : null;

  // The same "Needs an answer" set the Conversation tab lists: comments still
  // flagged open or in progress, among those this reader may see.
  const openQuestions = project.comments.filter(
    (comment) => comment.status === 'OPEN' || comment.status === 'IN_PROGRESS',
  ).length;

  const canSubmitHandoff = can(principal, 'handoff:submit');
  const handoffUnmet = canSubmitHandoff ? await unmetHandoffRequirements(project.id) : [];

  // Cover upload first; otherwise the most recent desktop homepage capture
  // (the new site's once there is one), for readers who can see Site QA.
  const heroCapture = can(principal, 'qa:read')
    ? await db.pageCapture
        .findMany({
          where: { projectId: project.id, viewport: 'DESKTOP', page: { pageType: 'HOME' } },
          orderBy: { capturedAt: 'desc' },
          take: 10,
          select: { id: true, phase: true },
        })
        .then((rows) => rows.find((row) => row.phase === 'AFTER') ?? rows[0] ?? null)
    : null;
  const heroImage = project.hasCoverImage
    ? {
        src: `/api/projects/${encodeURIComponent(project.code)}/cover?v=${project.coverImageUpdatedAt?.getTime() ?? 0}`,
        source: 'cover' as const,
      }
    : heroCapture
      ? { src: `/api/captures/${heroCapture.id}`, source: 'capture' as const }
      : null;

  const base = `/projects/${project.code}`;
  // Routes are unchanged; only the labels of Activity/Timeline changed, so
  // every existing link and bookmark still lands on the same page.
  const tabs: ProjectTab[] = [
    { href: base, label: 'Overview', primary: true },
    {
      href: `${base}/activity`,
      label: 'Conversation',
      count: openQuestions,
      countNoun: ['open question', 'open questions'],
      primary: true,
    },
    {
      href: `${base}/blockers`,
      label: 'Blockers',
      count: project.blockers.filter((blocker) => blocker.resolvedAt === null).length,
      countNoun: ['open blocker', 'open blockers'],
      alert: Boolean(openBlocker),
      primary: true,
    },
    {
      href: `${base}/issues`,
      label: 'Issues',
      count: openIssues.length,
      countNoun: ['open issue', 'open issues'],
      alert: openIssues.some((issue) => issue.severity === 'LAUNCH_BLOCKER'),
      primary: true,
    },
    ...(openFindings
      ? [
          {
            href: `${base}/qa`,
            label: 'Site QA',
            count: openFindings.reduce((sum, group) => sum + group._count._all, 0),
            countNoun: ['open finding', 'open findings'] as const,
            alert: openFindings.some((group) => group.severity === 'CRITICAL'),
            primary: true,
          },
        ]
      : []),
    {
      href: `${base}/approvals`,
      label: 'Approvals',
      count: pendingApprovals,
      countNoun: ['approval pending', 'approvals pending'],
      primary: true,
    },
    {
      href: `${base}/access`,
      label: 'Access',
      count: outstandingAccess,
      countNoun: ['item not verified', 'items not verified'],
      primary: false,
    },
    {
      href: `${base}/assets`,
      label: 'Assets',
      count: outstandingAssets,
      countNoun: ['required asset outstanding', 'required assets outstanding'],
      primary: false,
    },
    {
      href: `${base}/scope`,
      label: 'Scope',
      count: project.scopeItems.length,
      countNoun: ['scope item', 'scope items'],
      primary: false,
    },
    { href: `${base}/time`, label: 'Time & SLA', primary: false },
    { href: `${base}/timeline`, label: 'Events', primary: false },
    ...(can(principal, 'invoice:read')
      ? [
          {
            href: `${base}/invoices`,
            label: 'Invoices',
            alert: project.snapshot.invoice.overdue,
            primary: false,
          },
        ]
      : []),
    { href: `${base}/handoff`, label: 'SHOPLINE handoff', primary: false },
    ...(can(principal, 'project:update')
      ? [{ href: `${base}/settings`, label: 'Settings', primary: false }]
      : []),
  ];

  return (
    <div className="space-y-5">
      <Breadcrumbs
        items={[{ label: 'Projects', href: '/projects' }, { label: project.merchant.name }]}
      />

      <ProjectHero
        code={project.code}
        name={project.merchant.name}
        stage={project.stage}
        visitedStages={project.snapshot.visitedStages}
        migrationType={project.migrationType}
        startDate={project.startDate}
        ageMs={project.snapshot.time.ageMs}
        currentPlatform={project.merchantDetail.currentPlatform}
        shoplineStoreId={project.merchantDetail.shoplineStoreId}
        website={project.merchant.website}
        targetLaunchDate={project.targetLaunchDate}
        actualLaunchDate={project.actualLaunchDate}
        daysToTarget={project.snapshot.time.daysToTarget}
        people={[
          project.people.ahnPm,
          project.people.ahnDev,
          project.people.ahnDesigner,
          project.people.shoplineAm,
          project.people.shoplineSe,
        ].filter((person): person is NonNullable<typeof person> => person !== null)}
        image={heroImage}
        hasCover={project.hasCoverImage}
        hasCapture={heroCapture !== null}
        canEditCover={can(principal, 'project:update')}
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
              submitHandoff: canSubmitHandoff,
            }}
            handoffUnmet={handoffUnmet}
          />
        }
      />

      <StatusBand
        code={project.code}
        now={now}
        health={project.snapshot.health}
        nextStep={{
          text: project.nextAction,
          ownerName: project.nextActionOwner?.name ?? null,
          ownerId: project.nextActionOwner?.id ?? null,
          ownerTeam: project.nextActionOwnerTeam,
          dueDate: project.nextActionDueDate,
          canEdit: can(principal, 'project:update'),
        }}
        blocker={
          openBlocker
            ? {
                title: openBlocker.title,
                ownerName: openBlocker.owner?.name ?? null,
                ownerTeam: openBlocker.ownerTeam,
                startedAt: openBlocker.startedAt,
                dueDate: openBlocker.dueDate,
                nextAction: openBlocker.nextAction,
              }
            : null
        }
        launch={{
          targetLaunchDate: project.targetLaunchDate,
          actualLaunchDate: project.actualLaunchDate,
          daysToTarget: project.snapshot.time.daysToTarget,
        }}
      />

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
      {/* A swipeable strip until there is room for a 5-across grid; the fade
          on the right edge says there is more to scroll to. */}
      <ul className="scrollbar-slim -mx-4 flex snap-x snap-mandatory gap-2 overflow-x-auto px-4 pb-1 [mask-image:linear-gradient(to_right,black_calc(100%-32px),transparent)] sm:mx-0 sm:px-0 xl:grid xl:snap-none xl:grid-cols-5 xl:overflow-visible xl:pb-0 xl:[mask-image:none]">
        {answers.map((answer) => (
          <li key={answer.id} className="w-[12.5rem] shrink-0 snap-start xl:w-auto">
            <AnswerTile
              question={answer.question}
              value={answer.value}
              detail={answer.detail}
              tone={answer.tone}
              href={answerHref(code, answer.id)}
              density="compact"
              linkAs={Link}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * The merchant's name, not the project code - "PRJ-0008" in a browser tab
 * tells nobody which project they have open among several. `getProject` is
 * wrapped in React's own `cache()`, so this and the layout's own call below
 * dedupe into one query per request, not two.
 */
export async function generateMetadata({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const principal = await requirePrincipalOrRedirect(`/projects/${code}`);
  try {
    const project = await getProject(principal, code);
    return { title: project.merchant.name };
  } catch {
    return { title: code };
  }
}
