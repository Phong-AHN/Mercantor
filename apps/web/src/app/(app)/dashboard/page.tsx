import type { Metadata } from 'next';
import Link from 'next/link';
import {
  Activity,
  CalendarClock,
  CircleDollarSign,
  Clock,
  FolderKanban,
  OctagonAlert,
  Rocket,
  TriangleAlert,
} from 'lucide-react';
import {
  AGING_BAND_LABEL,
  formatDate,
  formatDuration,
  formatMoney,
  HEALTH_LABEL,
  STAGES,
  STAGE_PHASE_LABEL,
  TEAM_LABEL,
  type AgingBand,
  type ProjectHealth,
  type StagePhase,
} from '@relay/core';
import { can } from '@relay/rbac';
import {
  Alert,
  Avatar,
  buttonStyles,
  Card,
  CardBody,
  CardHeader,
  cn,
  DetailList,
  DetailRow,
  Empty,
  PageHeader,
  PermissionDenied,
  ProgressBar,
  Stat,
  TeamSplitBar,
  TONE_DOT,
} from '@relay/ui';
import { AgingPill, HealthPill, ProjectLink, StagePill } from '@/components/domain';
import { getPortfolioSummary } from '@/features/dashboard/queries';
import { requirePrincipalOrRedirect } from '@/server/session';

export const metadata: Metadata = { title: 'Dashboard' };
export const dynamic = 'force-dynamic';

const PHASES: StagePhase[] = ['ONBOARDING', 'BUILD', 'REVIEW', 'LAUNCH'];
const HEALTHS: ProjectHealth[] = ['ON_TRACK', 'AT_RISK', 'BLOCKED'];
const BANDS: AgingBand[] = ['ON_TRACK', 'ATTENTION', 'DELAYED', 'CRITICAL'];

export default async function DashboardPage() {
  const principal = await requirePrincipalOrRedirect('/dashboard');

  if (!can(principal, 'portfolio:read')) {
    return (
      <PermissionDenied
        title="The portfolio view is not part of your role"
        description="You can still open the projects you are assigned to."
      />
    );
  }

  const summary = await getPortfolioSummary(principal);
  const showMoney = can(principal, 'invoice:read');
  const now = summary.now;

  if (summary.total === 0) {
    return (
      <Card>
        <Empty
          title="No migrations yet"
          description="Create the first project record and the portfolio will build itself from there."
          action={
            can(principal, 'project:create')
              ? { label: 'New project', href: '/projects/new' }
              : undefined
          }
        />
      </Card>
    );
  }

  // Floor of 3 so a single project in a stage does not render as a full bar.
  const maxStageCount = Math.max(3, ...summary.byStage.map((entry) => entry.count));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={
          <>
            <span className="inline-flex items-center gap-1.5">
              <span className="bg-success size-1.5 animate-pulse rounded-full" />
              Live
            </span>
            <span className="text-faint">&middot;</span>
            <span>{formatDate(now)}</span>
          </>
        }
        title="Migration portfolio"
        description="Every SHOPLINE merchant migration AHN is running, and what each one is waiting on."
        actions={
          can(principal, 'project:create') ? (
            <Link href="/projects/new" className={buttonStyles('primary', 'md')}>
              New project
            </Link>
          ) : null
        }
      />

      {/* --- headline numbers ------------------------------------------- */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Stat
          label="Active"
          value={summary.active}
          detail={`${summary.completed} completed`}
          tone="accent"
          icon={<FolderKanban className="size-3.5" />}
        />
        <Stat
          label="Blocked"
          value={summary.byHealth.BLOCKED}
          detail={
            summary.launchBlockerCount > 0
              ? `${summary.launchBlockerCount} launch blocker${summary.launchBlockerCount === 1 ? '' : 's'}`
              : 'No launch blockers'
          }
          tone={summary.byHealth.BLOCKED > 0 ? 'danger' : 'success'}
          icon={<OctagonAlert className="size-3.5" />}
        />
        <Stat
          label="At risk"
          value={summary.byHealth.AT_RISK}
          detail={`${summary.overTarget.length} past target launch`}
          tone={summary.byHealth.AT_RISK > 0 ? 'warning' : 'success'}
          icon={<TriangleAlert className="size-3.5" />}
        />
        <Stat
          label="Launches this month"
          value={summary.launchesThisMonth.length}
          detail={`${summary.launchingSoon.length} in the next 3 weeks`}
          tone="info"
          icon={<Rocket className="size-3.5" />}
        />
        <Stat
          label="Avg project age"
          value={
            summary.avgTotalDurationMs === null
              ? '-'
              : formatDuration(summary.avgTotalDurationMs, { compact: true })
          }
          detail={
            summary.avgCompletedDurationMs === null
              ? 'No completed projects yet'
              : `${formatDuration(summary.avgCompletedDurationMs, { compact: true })} to complete`
          }
          tone="neutral"
          icon={<Clock className="size-3.5" />}
        />
        {showMoney ? (
          <Stat
            label="Outstanding"
            value={formatMoney(summary.invoiceOutstandingMinor, summary.currency, {
              compact: true,
            })}
            detail={
              summary.invoiceOverdueCount > 0
                ? `${summary.invoiceOverdueCount} overdue`
                : 'Nothing overdue'
            }
            tone={summary.invoiceOverdueCount > 0 ? 'danger' : 'success'}
            icon={<CircleDollarSign className="size-3.5" />}
          />
        ) : (
          <Stat
            label="Inactive 7+ days"
            value={summary.inactive.length}
            detail="No update logged"
            tone={summary.inactive.length > 0 ? 'warning' : 'success'}
            icon={<Activity className="size-3.5" />}
          />
        )}
      </div>

      {/* --- where everything is + health -------------------------------- */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Where everything is"
            description="Projects by stage, grouped by phase of the migration."
            actions={
              <Link
                href="/projects"
                className="text-accent-ink text-[12.5px] font-medium underline-offset-4 hover:underline"
              >
                Open the list
              </Link>
            }
          />
          <CardBody className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
            {PHASES.map((phase) => {
              const entries = summary.byStage.filter(
                (entry) => STAGES[entry.stage].phase === phase,
              );
              const phaseTotal = entries.reduce((sum, entry) => sum + entry.count, 0);
              return (
                <div key={phase}>
                  <div className="mb-2 flex items-baseline justify-between">
                    <p className="text-faint text-[11px] font-semibold uppercase tracking-[0.12em]">
                      {STAGE_PHASE_LABEL[phase]}
                    </p>
                    <p className="tabular text-muted text-[12px]">{phaseTotal}</p>
                  </div>
                  <ul className="space-y-1">
                    {entries.map((entry) => (
                      <li key={entry.stage}>
                        <Link
                          href={`/projects?stage=${entry.stage}`}
                          className="hover:bg-surface-2 flex items-center gap-3 rounded-[var(--radius-sm)] px-2 py-1.5 transition-colors"
                        >
                          <span className="text-ink-soft w-36 shrink-0 truncate text-[12.5px]">
                            {STAGES[entry.stage].label}
                          </span>
                          <span className="min-w-0 flex-1">
                            <ProgressBar
                              value={entry.count}
                              max={maxStageCount}
                              size="sm"
                              tone={entry.count === 0 ? 'muted' : 'accent'}
                              label={`${entry.count} projects in ${STAGES[entry.stage].label}`}
                            />
                          </span>
                          <span className="tabular text-ink w-6 shrink-0 text-right text-[12.5px] font-medium">
                            {entry.count || <span className="text-faint">0</span>}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}

            {summary.byStage.some(
              (entry) => entry.stage === 'ON_HOLD_BLOCKED' && entry.count > 0,
            ) && (
              <Alert tone="danger" dense className="sm:col-span-2">
                {summary.byStage.find((entry) => entry.stage === 'ON_HOLD_BLOCKED')?.count}{' '}
                project(s) are on hold and off the linear track.
              </Alert>
            )}
          </CardBody>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Health" description="Derived, never typed in." />
            <CardBody className="space-y-3">
              {HEALTHS.map((health) => {
                const count = summary.byHealth[health];
                const pct = summary.active > 0 ? (count / summary.active) * 100 : 0;
                return (
                  <Link
                    key={health}
                    href={`/projects?health=${health}`}
                    className="hover:bg-surface-2 block rounded-[var(--radius-sm)] p-1 transition-colors"
                  >
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-ink-soft flex items-center gap-2 text-[13px]">
                        <span
                          className={cn('size-2 rounded-full', TONE_DOT[HEALTH_LABEL[health].tone])}
                        />
                        {HEALTH_LABEL[health].label}
                      </span>
                      <span className="tabular text-ink text-[13px] font-semibold">{count}</span>
                    </div>
                    <ProgressBar
                      value={pct}
                      size="sm"
                      tone={HEALTH_LABEL[health].tone}
                      label={`${HEALTH_LABEL[health].label}: ${count}`}
                    />
                  </Link>
                );
              })}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Ageing" description="Configurable bands, applied to project age." />
            <CardBody>
              <ul className="space-y-2">
                {BANDS.map((band) => (
                  <li key={band} className="flex items-center justify-between gap-3">
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        className={cn(
                          'size-2 shrink-0 rounded-full',
                          TONE_DOT[AGING_BAND_LABEL[band].tone],
                        )}
                      />
                      <span className="text-ink-soft truncate text-[13px]">
                        {AGING_BAND_LABEL[band].label}
                      </span>
                      <span className="text-faint shrink-0 text-[11px]">
                        {AGING_BAND_LABEL[band].hint}
                      </span>
                    </span>
                    <span className="tabular text-ink text-[13px] font-semibold">
                      {summary.byAging[band]}
                    </span>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        </div>
      </div>

      {/* --- time and delay ownership ------------------------------------ */}
      <Card>
        <CardHeader
          title="Where the time goes"
          description="Elapsed time across active projects, charged to whoever the clock was running against."
          icon={<Clock className="size-4" />}
        />
        <CardBody className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <div>
            <TeamSplitBar
              byTeam={summary.timeByTeam}
              format={(ms) => formatDuration(ms, { compact: true })}
              height="lg"
            />
            <dl className="mt-5 grid gap-x-6 gap-y-1 sm:grid-cols-2">
              {(['AHN', 'MERCHANT', 'SHOPLINE', 'OTHER'] as const).map((team) => (
                <div key={team} className="flex items-center justify-between py-1.5">
                  <dt className="text-muted text-[13px]">
                    Avg {TEAM_LABEL[team].label.toLowerCase()} time per project
                  </dt>
                  <dd className="tabular text-ink text-[13px] font-medium">
                    {formatDuration(summary.avgByTeam[team], { compact: true })}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          <DetailList>
            <DetailRow label="Projects on schedule">
              <span className="text-success-ink">{summary.onSchedule}</span>
              <span className="text-faint"> / {summary.active}</span>
            </DetailRow>
            <DetailRow label="Past target launch">
              <span className={summary.overTarget.length > 0 ? 'text-danger-ink' : ''}>
                {summary.overTarget.length}
              </span>
            </DetailRow>
            <DetailRow label="No target date set">
              <span className={summary.noTargetDate > 0 ? 'text-warning-ink' : ''}>
                {summary.noTargetDate}
              </span>
            </DetailRow>
            <DetailRow label="Longest active project">
              {summary.longestActive ? (
                <Link
                  href={`/projects/${summary.longestActive.code}`}
                  className="hover:text-accent-ink"
                >
                  {summary.longestActive.merchant.name}
                  <span className="tabular text-faint ml-1.5">
                    {formatDuration(summary.longestActive.snapshot.time.ageMs, { compact: true })}
                  </span>
                </Link>
              ) : (
                <span className="text-faint">-</span>
              )}
            </DetailRow>
            <DetailRow label="Awaiting SHOPLINE">{summary.awaitingShopline.length}</DetailRow>
            <DetailRow label="Awaiting merchant">
              {summary.awaitingMerchantApproval.length}
            </DetailRow>
          </DetailList>
        </CardBody>
      </Card>

      {/* --- blockers ----------------------------------------------------- */}
      <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardHeader
            title="Open blockers"
            count={summary.activeBlockers.length}
            description="Oldest first. Each one has its own clock, charged to its current owner."
            icon={<OctagonAlert className="size-4" />}
            actions={
              <Link
                href="/blockers"
                className="text-accent-ink text-[12.5px] font-medium underline-offset-4 hover:underline"
              >
                All blockers
              </Link>
            }
          />
          {summary.activeBlockers.length === 0 ? (
            <Empty
              title="Nothing is blocked"
              description="Every active migration has a clear next step."
              className="py-10"
            />
          ) : (
            <ul className="divide-line divide-y">
              {summary.activeBlockers.slice(0, 6).map((blocker) => (
                <li key={`${blocker.project.id}-${blocker.startedAt.getTime()}`}>
                  <Link
                    href={`/projects/${blocker.project.code}#blockers`}
                    className="hover:bg-surface-2 flex items-start gap-3 px-5 py-3.5 transition-colors"
                  >
                    <span className="bg-danger-soft text-danger-ink mt-0.5 grid size-7 shrink-0 place-items-center rounded-full">
                      <OctagonAlert className="size-3.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-baseline gap-x-2">
                        <span className="text-ink truncate text-[13.5px] font-medium leading-5">
                          {blocker.title}
                        </span>
                        <span className="text-faint font-mono text-[11px]">
                          {blocker.project.code}
                        </span>
                      </span>
                      <span className="text-muted mt-0.5 block truncate text-[12.5px]">
                        {blocker.project.merchant.name} &middot;{' '}
                        {blocker.nextAction ?? 'No next action recorded'}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="tabular text-danger-ink block text-[13px] font-semibold">
                        {formatDuration(blocker.ageMs, { compact: true })}
                      </span>
                      <span className="text-muted block text-[11.5px]">
                        {blocker.ownerName ?? TEAM_LABEL[blocker.ownerTeam].label}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Blocked on" description="Who owns the open blockers." />
            <CardBody>
              <ul className="space-y-2.5">
                {(['MERCHANT', 'AHN', 'SHOPLINE', 'OTHER'] as const).map((team) => (
                  <li key={team}>
                    <Link
                      href={`/projects?blockerOwner=${team}`}
                      className="hover:bg-surface-2 flex items-center justify-between rounded-[var(--radius-sm)] px-1 py-1 transition-colors"
                    >
                      <span className="text-ink-soft text-[13px]">{TEAM_LABEL[team].label}</span>
                      <span className="tabular text-ink text-[13px] font-semibold">
                        {summary.blockersByTeam[team]}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Launching soon"
              count={summary.launchingSoon.length}
              icon={<CalendarClock className="size-4" />}
            />
            {summary.launchingSoon.length === 0 ? (
              <Empty title="No launches scheduled" className="py-8" />
            ) : (
              <ul className="divide-line divide-y">
                {summary.launchingSoon.slice(0, 5).map((project) => (
                  <li key={project.id} className="flex items-center gap-3 px-5 py-3">
                    <Avatar name={project.merchant.name} size="sm" team="SHOPLINE" />
                    <div className="min-w-0 flex-1">
                      <ProjectLink code={project.code} name={project.merchant.name} />
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="tabular text-ink text-[12.5px] font-medium">
                        {formatDate(project.targetLaunchDate)}
                      </p>
                      <StagePill stage={project.stage} size="sm" />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      {/* --- needs attention --------------------------------------------- */}
      {(summary.inactive.length > 0 || summary.overTarget.length > 0) && (
        <Card>
          <CardHeader
            title="Needs attention"
            description="Projects that are not blocked, but are drifting."
            icon={<TriangleAlert className="size-4" />}
          />
          <ul className="divide-line divide-y">
            {[
              ...new Map(
                [...summary.overTarget, ...summary.inactive].map((project) => [
                  project.id,
                  project,
                ]),
              ).values(),
            ]
              .slice(0, 8)
              .map((project) => (
                <li key={project.id}>
                  <Link
                    href={`/projects/${project.code}`}
                    className="hover:bg-surface-2 flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5 transition-colors"
                  >
                    <div className="min-w-[12rem] flex-1">
                      <ProjectLink
                        code={project.code}
                        name={project.merchant.name}
                        linked={false}
                      />
                    </div>
                    <StagePill stage={project.stage} size="sm" />
                    <HealthPill
                      health={project.snapshot.health.health}
                      size="sm"
                      reason={project.snapshot.health.reasons[0]}
                    />
                    <AgingPill
                      band={project.snapshot.time.agingBand}
                      ageMs={project.snapshot.time.ageMs}
                      size="sm"
                    />
                    <p className="text-muted min-w-[14rem] flex-1 truncate text-[12.5px]">
                      {project.snapshot.health.reasons[0] ?? 'Drifting'}
                    </p>
                  </Link>
                </li>
              ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
