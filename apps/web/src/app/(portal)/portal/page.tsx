import type { Metadata } from 'next';
import Link from 'next/link';
import { CircleCheck, Clock, KeyRound, FolderOpen } from 'lucide-react';
import {
  ACTIVITY_TYPE_LABEL,
  formatDate,
  formatDuration,
  formatRelative,
  isAppError,
  LINEAR_STAGES,
  STAGES,
} from '@relay/core';
import {
  Alert,
  Avatar,
  Card,
  CardBody,
  CardHeader,
  cn,
  DetailList,
  DetailRow,
  Empty,
  NotFoundState,
  PageHeader,
  ProgressBar,
  Stat,
  Timeline,
  TimelineItem,
} from '@relay/ui';
import { StagePill } from '@/components/domain';
import { getPortalProject } from '@/features/portal/queries';
import { requirePrincipalOrRedirect } from '@/server/session';

export const metadata: Metadata = { title: 'Your migration' };
export const dynamic = 'force-dynamic';

/**
 * The merchant's overview. Deliberately narrower than the internal one: where
 * it is, what is needed from them, and who to ask. No portfolio, no money, no
 * internal notes - those rows are never fetched for this principal.
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

  const now = project.snapshot.time.now;
  const stageOrder = STAGES[project.stage].order ?? 0;
  const progress = (stageOrder / LINEAR_STAGES.length) * 100;

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

  const waitingOnYou =
    merchantBlockers.length +
    accessOutstanding.length +
    assetsOutstanding.length +
    pendingApprovals.length;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={<span>Migrating to SHOPLINE with AHN Media</span>}
        title={project.merchant.name}
        description={STAGES[project.stage].description}
        meta={
          <>
            <StagePill stage={project.stage} showPhase />
            <span className="text-muted text-[12px]">
              Step {stageOrder} of {LINEAR_STAGES.length}
            </span>
            {project.targetLaunchDate && (
              <span className="text-muted text-[12px]">
                Target launch {formatDate(project.targetLaunchDate)}
              </span>
            )}
          </>
        }
      />

      {waitingOnYou > 0 ? (
        <Alert
          tone="warning"
          title={`${waitingOnYou} thing${waitingOnYou === 1 ? '' : 's'} need${waitingOnYou === 1 ? 's' : ''} you`}
        >
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {merchantBlockers.map((blocker) => (
              <li key={blocker.id}>
                {blocker.title}
                {blocker.nextAction ? ` - ${blocker.nextAction}` : ''}
              </li>
            ))}
            {accessOutstanding.length > 0 && (
              <li>
                <Link href="/portal/access" className="underline underline-offset-4">
                  {accessOutstanding.length} access item(s) still needed
                </Link>
              </li>
            )}
            {assetsOutstanding.length > 0 && (
              <li>
                <Link href="/portal/assets" className="underline underline-offset-4">
                  {assetsOutstanding.length} required asset(s) still needed
                </Link>
              </li>
            )}
            {pendingApprovals.length > 0 && (
              <li>
                <Link href="/portal/approvals" className="underline underline-offset-4">
                  Final approval is waiting on you
                </Link>
              </li>
            )}
          </ul>
        </Alert>
      ) : (
        <Alert tone="success" title="Nothing is waiting on you">
          AHN has everything they need right now. We will let you know as soon as that changes.
        </Alert>
      )}

      <Card>
        <CardBody className="space-y-3">
          <div className="flex items-baseline justify-between">
            <p className="text-ink text-[13px] font-medium">Migration progress</p>
            <p className="tabular text-muted text-[12.5px]">{Math.round(progress)}%</p>
          </div>
          <ProgressBar value={progress} tone="accent" label="Migration progress" />
          <div className="text-muted flex flex-wrap items-center gap-x-6 gap-y-1 text-[12px]">
            <span>Started {formatDate(project.startDate)}</span>
            <span className="tabular">
              Running {formatDuration(project.snapshot.time.ageMs, { compact: true })}
            </span>
            <span>
              Currently in {STAGES[project.stage].label} for{' '}
              <span className="tabular">
                {formatDuration(project.snapshot.time.currentStageMs, { compact: true })}
              </span>
            </span>
          </div>
        </CardBody>
      </Card>

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
          label="Assets"
          done={project.assetItems.filter((item) => item.status === 'APPROVED').length}
          total={project.assetItems.length}
          outstanding={assetsOutstanding.length}
        />
        <Stat
          label="Next step"
          value={
            project.nextActionOwnerTeam === 'MERCHANT'
              ? 'With you'
              : project.nextActionOwnerTeam === 'AHN'
                ? 'With AHN'
                : project.nextActionOwnerTeam === 'SHOPLINE'
                  ? 'With SHOPLINE'
                  : 'Not set'
          }
          detail={project.nextAction ?? 'No next step recorded'}
          tone={project.nextActionOwnerTeam === 'MERCHANT' ? 'warning' : 'success'}
          icon={<Clock className="size-3.5" />}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader
            title="What has happened"
            description="Updates from AHN and SHOPLINE on your migration."
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
                {project.activities.slice(0, 8).map((event, index, list) => (
                  <TimelineItem
                    key={event.id}
                    tone={ACTIVITY_TYPE_LABEL[event.type].tone}
                    title={event.summary}
                    meta={formatRelative(event.occurredAt, now)}
                    connector={index < list.length - 1}
                  >
                    {event.detail && <p>{event.detail}</p>}
                  </TimelineItem>
                ))}
              </Timeline>
            )}
          </CardBody>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Who to ask" />
            <CardBody className="space-y-3">
              {[
                { label: 'AHN project manager', person: project.people.ahnPm },
                { label: 'AHN developer', person: project.people.ahnDev },
                { label: 'SHOPLINE account manager', person: project.people.shoplineAm },
              ].map(({ label, person }) => (
                <div key={label} className="flex items-center justify-between gap-3">
                  <span className="text-muted text-[12px]">{label}</span>
                  {person ? (
                    <span className="flex items-center gap-2">
                      <Avatar name={person.name} team={person.team} size="sm" />
                      <span className="text-ink text-[12.5px] font-medium">{person.name}</span>
                    </span>
                  ) : (
                    <span className="text-faint text-[12.5px]">Not assigned</span>
                  )}
                </div>
              ))}
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
