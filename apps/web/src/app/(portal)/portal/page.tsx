import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowRight,
  CircleAlert,
  CircleCheck,
  Clock,
  FolderOpen,
  ImageOff,
  KeyRound,
  Stamp,
} from 'lucide-react';
import {
  ACTIVITY_TYPE_LABEL,
  clock,
  formatDate,
  formatDuration,
  formatRelative,
  isAppError,
  TEAM_LABEL,
} from '@relay/core';
import {
  Avatar,
  Card,
  CardBody,
  CardHeader,
  cn,
  DetailList,
  DetailRow,
  Empty,
  NotFoundState,
  ProgressBar,
  Timeline,
  TimelineItem,
} from '@relay/ui';
import { ShowcaseCard } from '@/components/qa/showcase-card';
import { getPortalProject } from '@/features/portal/queries';
import { captureSrc, listShowcase } from '@/features/qa/queries';
import { requirePrincipalOrRedirect } from '@/server/session';
import { PortalHero } from './portal-hero';

export const metadata: Metadata = { title: 'Your migration' };
export const dynamic = 'force-dynamic';

/**
 * The merchant's overview. Deliberately narrower than the internal one: where
 * it is, what is needed from them, what their new store looks like, and who
 * to ask. No portfolio, no money, no internal notes - those rows are never
 * fetched for this principal, and the before/after only ever shows
 * comparisons someone shared with them (`listShowcase` filters on that).
 */
export default async function PortalOverviewPage() {
  const principal = await requirePrincipalOrRedirect('/portal');

  let project: Awaited<ReturnType<typeof getPortalProject>>;
  try {
    project = await getPortalProject(principal);
  } catch (error) {
    if (isAppError(error) && error.code === 'NOT_FOUND') {
      return (
        <NotFoundState
          title="No migration project yet"
          description="Once SHOPLINE and AHN set your project up, it will appear here."
        />
      );
    }
    throw error;
  }

  const [showcase] = await listShowcase(principal, project.code);
  const sharedPair = showcase?.comparisons[0] ?? null;
  const now = project.snapshot.time.now;

  // The cover first; otherwise the new storefront from a shared comparison,
  // desktop preferred - never a capture nobody has shared with the merchant.
  const sharedAfter =
    showcase?.comparisons.find((pair) => pair.afterCapture.viewport === 'DESKTOP')?.afterCapture ??
    sharedPair?.afterCapture ??
    null;
  const heroImage = project.hasCoverImage
    ? {
        src: `/api/projects/${encodeURIComponent(project.code)}/cover?v=${project.coverImageUpdatedAt?.getTime() ?? 0}`,
      }
    : sharedAfter
      ? { src: captureSrc(sharedAfter.id) }
      : null;

  const accessOutstanding = project.accessItems.filter((item) => item.status !== 'VERIFIED');
  const assetsOutstanding = project.assetItems.filter(
    (item) => item.required && item.status !== 'APPROVED',
  );
  const merchantBlockers = project.blockers.filter(
    (blocker) => blocker.resolvedAt === null && blocker.ownerTeam === 'MERCHANT',
  );
  const pendingApprovals = project.approvals.filter(
    (approval) => approval.type === 'MERCHANT_FINAL' && approval.status === 'PENDING',
  );

  const todo: TodoItem[] = [
    ...merchantBlockers.map((blocker) => ({
      key: blocker.id,
      icon: <CircleAlert className="size-4" />,
      title: blocker.title,
      detail: blocker.nextAction ?? 'Your team is waiting on you for this.',
      href: '/portal/activity',
      cta: 'Reply to the team',
    })),
    ...(pendingApprovals.length > 0
      ? [
          {
            key: 'approval',
            icon: <Stamp className="size-4" />,
            title: 'Your final approval',
            detail: 'Review your new store and sign it off so it can go live.',
            href: '/portal/approvals',
            cta: 'Review and approve',
          },
        ]
      : []),
    ...(accessOutstanding.length > 0
      ? [
          {
            key: 'access',
            icon: <KeyRound className="size-4" />,
            title: `${accessOutstanding.length} access item${accessOutstanding.length === 1 ? '' : 's'} still needed`,
            detail: accessOutstanding
              .slice(0, 3)
              .map((item) => item.label)
              .join(', '),
            href: '/portal/access',
            cta: 'Give access',
          },
        ]
      : []),
    ...(assetsOutstanding.length > 0
      ? [
          {
            key: 'assets',
            icon: <FolderOpen className="size-4" />,
            title: `${assetsOutstanding.length} file${assetsOutstanding.length === 1 ? '' : 's'} still needed`,
            detail: assetsOutstanding
              .slice(0, 3)
              .map((item) => item.label)
              .join(', '),
            href: '/portal/assets',
            cta: 'Upload files',
          },
        ]
      : []),
  ];

  const nextStepWithYou = project.nextActionOwnerTeam.includes('MERCHANT');
  const nextStepOwner = nextStepWithYou
    ? 'you'
    : project.nextActionOwnerTeam.length > 0
      ? project.nextActionOwnerTeam.map((team) => TEAM_LABEL[team].label).join(' & ')
      : null;

  const team = [
    { label: 'Project manager', person: project.people.ahnPm },
    { label: 'Developer', person: project.people.ahnDev },
    { label: 'Designer', person: project.people.ahnDesigner },
    { label: 'SHOPLINE account manager', person: project.people.shoplineAm },
  ];

  return (
    <div className="space-y-6">
      <PortalHero
        name={project.merchant.name}
        stage={project.stage}
        visitedStages={project.snapshot.visitedStages}
        currentPlatform={project.merchantDetail.currentPlatform}
        website={project.merchantDetail.website}
        targetLaunchDate={project.targetLaunchDate}
        actualLaunchDate={project.actualLaunchDate}
        daysToTarget={project.snapshot.time.daysToTarget}
        people={team.flatMap(({ person }) => (person ? [person] : []))}
        image={heroImage}
      />

      <section aria-labelledby="todo-heading" className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="todo-heading" className="text-ink text-[16px] font-semibold tracking-tight">
            {todo.length > 0 ? 'What we need from you' : 'Nothing is waiting on you'}
          </h2>
          {project.nextAction && (
            <p className="text-muted flex items-center gap-1.5 text-[12.5px]">
              <Clock className="size-3.5" aria-hidden />
              Next: {project.nextAction}
              {nextStepOwner && <span className="text-faint"> · with {nextStepOwner}</span>}
            </p>
          )}
        </div>
        {todo.length > 0 ? (
          <ul className="grid gap-3 sm:grid-cols-2">
            {todo.map((item) => (
              <li key={item.key}>
                <TodoCard item={item} />
              </li>
            ))}
          </ul>
        ) : (
          <div className="border-success/30 bg-success-soft/50 flex items-start gap-3 rounded-[var(--radius-lg)] border p-4">
            <span className="bg-success-soft text-success-ink grid size-9 shrink-0 place-items-center rounded-full">
              <CircleCheck className="size-4.5" />
            </span>
            <div>
              <p className="text-ink text-[13.5px] font-medium">You are all caught up</p>
              <p className="text-muted mt-0.5 text-[12.5px] leading-5">
                AHN has everything they need right now. We will let you know as soon as that
                changes.
              </p>
            </div>
          </div>
        )}
      </section>

      <section aria-labelledby="store-heading" className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="store-heading" className="text-ink text-[16px] font-semibold tracking-tight">
            Your new store
          </h2>
          {showcase && (
            <Link
              href="/portal/qa"
              className="text-accent-ink inline-flex items-center gap-1 text-[12.5px] font-medium underline-offset-4 hover:underline"
            >
              See the full site review
              <ArrowRight className="size-3.5" />
            </Link>
          )}
        </div>
        {showcase && sharedPair ? (
          <ShowcaseCard
            project={showcase}
            href="/portal/qa"
            findingsHref="/portal/qa#findings"
            now={clock.now()}
            size="hero"
          />
        ) : (
          <div className="border-line bg-surface-1 grid gap-5 rounded-[var(--radius-lg)] border border-dashed p-5 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] sm:items-center">
            <div className="bg-surface-2 text-faint grid aspect-[16/10] place-items-center rounded-[var(--radius-md)]">
              <ImageOff className="size-6" aria-hidden />
            </div>
            <div>
              <p className="text-ink text-[13.5px] font-medium">Your before and after is on its way</p>
              <p className="text-muted mt-1 max-w-prose text-[12.5px] leading-5">
                As your new SHOPLINE store takes shape, your AHN team will share side-by-side
                comparisons of your current site and the new one here, with the results they
                measured.
              </p>
            </div>
          </div>
        )}
      </section>

      <div className="grid gap-3 sm:grid-cols-3">
        <PortalTile
          href="/portal/access"
          icon={<KeyRound className="size-4" />}
          label="Access"
          done={project.accessItems.length - accessOutstanding.length}
          total={project.accessItems.length}
          outstanding={accessOutstanding.length}
        />
        <PortalTile
          href="/portal/assets"
          icon={<FolderOpen className="size-4" />}
          label="Files and assets"
          done={project.assetItems.filter((item) => item.status === 'APPROVED').length}
          total={project.assetItems.length}
          outstanding={assetsOutstanding.length}
        />
        <div className="border-line bg-surface-1 shadow-card rounded-[var(--radius-lg)] border p-4">
          <p className="text-ink flex items-center gap-2 text-[12.5px] font-medium">
            <span className="text-muted">
              <Clock className="size-4" />
            </span>
            Time so far
          </p>
          <p className="text-ink tabular mt-2 text-[20px] font-semibold leading-7 tracking-tight">
            {formatDuration(project.snapshot.time.ageMs, { compact: true })}
          </p>
          <p className="text-muted mt-0.5 text-[11.5px]">
            Since {formatDate(project.startDate)} ·{' '}
            {formatDuration(project.snapshot.time.currentStageMs, { compact: true })} in this step
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader
            title="Latest updates"
            description="What AHN and SHOPLINE have done on your migration."
            actions={
              <Link
                href="/portal/activity"
                className="text-accent-ink text-[12.5px] font-medium underline-offset-4 hover:underline"
              >
                See everything
              </Link>
            }
          />
          <CardBody>
            {project.activities.length === 0 ? (
              <Empty title="Nothing to report yet" className="py-8" />
            ) : (
              <Timeline>
                {project.activities.slice(0, 6).map((event, index, list) => (
                  <TimelineItem
                    key={event.id}
                    tone={ACTIVITY_TYPE_LABEL[event.type].tone}
                    title={event.summary}
                    meta={formatRelative(event.occurredAt, now)}
                    connector={index < list.length - 1}
                  >
                    {event.detail && <p className="line-clamp-2">{event.detail}</p>}
                  </TimelineItem>
                ))}
              </Timeline>
            )}
          </CardBody>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader
              title="Your team"
              description="Ask any of them - in the conversation, or however you usually reach them."
            />
            <CardBody>
              <ul className="space-y-3">
                {team.map(({ label, person }) => (
                  <li key={label} className="flex items-center gap-3">
                    {person ? (
                      <Avatar name={person.name} team={person.team} size="md" />
                    ) : (
                      <span className="border-line bg-surface-2 size-8 shrink-0 rounded-full border border-dashed" />
                    )}
                    <div className="min-w-0">
                      <p
                        className={cn(
                          'truncate text-[13px] font-medium',
                          person ? 'text-ink' : 'text-faint',
                        )}
                      >
                        {person?.name ?? 'Not assigned yet'}
                      </p>
                      <p className="text-muted text-[11.5px]">{label}</p>
                    </div>
                  </li>
                ))}
              </ul>
              <Link
                href="/portal/activity"
                className="border-line text-ink hover:bg-surface-2 mt-4 flex items-center justify-center gap-1.5 rounded-[var(--radius-md)] border px-3 py-2 text-[12.5px] font-medium transition-colors"
              >
                Send the team a message
                <ArrowRight className="size-3.5" />
              </Link>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Your store" />
            <CardBody>
              <DetailList>
                {project.merchantDetail.website && (
                  <DetailRow label="Current site">
                    <a
                      href={project.merchantDetail.website}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-accent-ink underline-offset-4 hover:underline"
                    >
                      {project.merchantDetail.website.replace(/^https?:\/\//, '')}
                    </a>
                  </DetailRow>
                )}
                {project.merchantDetail.currentPlatform && (
                  <DetailRow label="Moving from">
                    {project.merchantDetail.currentPlatform}
                  </DetailRow>
                )}
                {project.merchantDetail.shoplineStoreId && (
                  <DetailRow label="SHOPLINE store">
                    {project.merchantDetail.shoplineStoreId}
                  </DetailRow>
                )}
                <DetailRow label="Target launch">
                  {project.targetLaunchDate ? formatDate(project.targetLaunchDate) : 'To confirm'}
                </DetailRow>
              </DetailList>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}

interface TodoItem {
  key: string;
  icon: React.ReactNode;
  title: string;
  detail: string;
  href: string;
  cta: string;
}

function TodoCard({ item }: { item: TodoItem }) {
  return (
    <Link
      href={item.href}
      className="border-warning/40 bg-surface-1 shadow-card hover:shadow-raised group flex h-full items-start gap-3 rounded-[var(--radius-lg)] border p-4 transition-shadow"
    >
      <span className="bg-warning-soft text-warning-ink grid size-9 shrink-0 place-items-center rounded-full">
        {item.icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-ink text-[13.5px] font-medium leading-5">{item.title}</p>
        {item.detail && (
          <p className="text-muted mt-0.5 line-clamp-2 text-[12.5px] leading-5">{item.detail}</p>
        )}
        <p className="text-accent-ink mt-2 inline-flex items-center gap-1 text-[12.5px] font-medium">
          {item.cta}
          <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
        </p>
      </div>
    </Link>
  );
}

function PortalTile({
  href,
  icon,
  label,
  done,
  total,
  outstanding,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  done: number;
  total: number;
  outstanding: number;
}) {
  const pct = total === 0 ? 0 : (done / total) * 100;
  return (
    <Link
      href={href}
      className="border-line bg-surface-1 shadow-card hover:shadow-raised block rounded-[var(--radius-lg)] border p-4 transition-shadow"
    >
      <div className="flex items-center justify-between">
        <p className="text-ink flex items-center gap-2 text-[12.5px] font-medium">
          <span className="text-muted">{icon}</span>
          {label}
        </p>
        <p className="tabular text-muted text-[12.5px]">
          {done}
          <span className="text-faint">/{total}</span>
        </p>
      </div>
      <ProgressBar
        value={pct}
        size="sm"
        tone={outstanding > 0 ? 'warning' : 'success'}
        className="mt-2.5"
        label={label}
      />
      <p
        className={cn(
          'mt-2 flex items-center gap-1.5 text-[11.5px]',
          outstanding > 0 ? 'text-warning-ink' : 'text-success-ink',
        )}
      >
        {outstanding === 0 && <CircleCheck className="size-3.5" />}
        {outstanding > 0 ? `${outstanding} still needed from you` : 'All done'}
      </p>
    </Link>
  );
}
