import Link from 'next/link';
import { OctagonAlert } from 'lucide-react';
import {
  formatDate,
  formatDays,
  formatDuration,
  HEALTH_LABEL,
  TEAM_LABEL,
  type ProjectHealth,
  type Team,
} from '@relay/core';
import { cn, TONE_DOT } from '@relay/ui';
import { HealthPill } from '@/components/domain';
import { NextStep } from './next-action-card';

const BAR: Record<ProjectHealth, string> = {
  ON_TRACK: 'bg-success',
  AT_RISK: 'bg-warning',
  BLOCKED: 'bg-danger',
};

export interface StatusBandProps {
  code: string;
  now: Date;
  health: { health: ProjectHealth; reasons: readonly string[] };
  nextStep: {
    text: string | null;
    ownerName: string | null;
    ownerId: string | null;
    ownerTeam: readonly Team[];
    dueDate: Date | null;
    canEdit: boolean;
  };
  blocker: {
    title: string;
    ownerName: string | null;
    ownerTeam: Team;
    startedAt: Date;
    dueDate: Date | null;
    nextAction: string | null;
  } | null;
  launch: {
    targetLaunchDate: Date | null;
    actualLaunchDate: Date | null;
    daysToTarget: number | null;
  };
}

/** Same whole-day rule as the answer tiles (`formatDays`), so the two never disagree by one. */
function days(value: number): string {
  return formatDays(value);
}

function isToday(value: number): boolean {
  return Math.floor(Math.abs(value)) === 0;
}

/**
 * The first thing on every project page, answering the three questions people
 * open a project for: what happens next and who owns it, is anything stuck,
 * and are we on time for launch. The health reason is written out, not left
 * in a tooltip, because it is the most important sentence on the page.
 */
export function StatusBand({ code, now, health, nextStep, blocker, launch }: StatusBandProps) {
  const descriptor = HEALTH_LABEL[health.health];
  const reasons = health.reasons.filter(Boolean);
  const late = launch.daysToTarget !== null && launch.daysToTarget < 0;
  const launchSlip =
    launch.actualLaunchDate && launch.targetLaunchDate
      ? (launch.actualLaunchDate.getTime() - launch.targetLaunchDate.getTime()) / 86_400_000
      : null;

  return (
    <section
      aria-label="Project status"
      className="border-line bg-surface-1 shadow-card relative overflow-hidden rounded-[var(--radius-lg)] border"
    >
      <span className={cn('absolute inset-y-0 left-0 w-1', BAR[health.health])} aria-hidden />
      {/* Phone: next, stuck, launch stacked. Tablet: next across, stuck and
          launch side by side under it. Desktop: next and launch on the left,
          stuck on the right - a blocker makes that column tall, and the
          left one fills the same height instead of leaving a hole. */}
      <div className="grid gap-x-8 gap-y-4 py-4 pl-5 pr-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:grid-rows-[auto_1fr] lg:pr-5">
        <div className="min-w-0 sm:col-span-2 lg:col-span-1 lg:col-start-1 lg:row-start-1">
          <NextStep
            code={code}
            nextAction={nextStep.text}
            ownerName={nextStep.ownerName}
            ownerId={nextStep.ownerId}
            ownerTeam={nextStep.ownerTeam}
            dueDate={nextStep.dueDate?.toISOString() ?? null}
            canEdit={nextStep.canEdit}
            now={now.toISOString()}
          />
        </div>

        <div className="border-line min-w-0 border-t pt-4 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
          <h2 className="text-muted text-[12px] font-medium leading-4">Is anything stuck?</h2>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <HealthPill health={health.health} />
            {!blocker && health.health === 'ON_TRACK' && (
              <span className="text-ink-soft text-[13px]">No open blocker.</span>
            )}
          </div>
          {reasons.length > 0 && health.health !== 'ON_TRACK' && (
            <p className="text-ink-soft mt-1.5 text-[13px] leading-5 [overflow-wrap:anywhere]">
              <span className="sr-only">{descriptor.label} because: </span>
              {reasons.join(' ')}
            </p>
          )}
          {blocker && (
            <div className="border-danger/30 bg-danger-soft mt-2 rounded-[var(--radius-md)] border px-3 py-2">
              <p className="text-danger-ink flex items-start gap-1.5 text-[13px] font-semibold leading-5 [overflow-wrap:anywhere]">
                <OctagonAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                <span>
                  <span className="sr-only">Open blocker: </span>
                  {blocker.title}
                </span>
              </p>
              <p className="text-danger-ink/85 mt-0.5 text-[12.5px] leading-5">
                <span
                  className={cn(
                    'mr-1 inline-block size-1.5 rounded-full align-middle',
                    TONE_DOT[TEAM_LABEL[blocker.ownerTeam].tone],
                  )}
                  aria-hidden
                />
                {blocker.ownerName ?? TEAM_LABEL[blocker.ownerTeam].label} · open{' '}
                {formatDuration(now.getTime() - blocker.startedAt.getTime(), { compact: true })}
                {blocker.dueDate ? ` · due ${formatDate(blocker.dueDate)}` : ''}
              </p>
              {blocker.nextAction && (
                <p className="text-danger-ink/85 text-[12.5px] leading-5 [overflow-wrap:anywhere]">
                  To unblock: {blocker.nextAction}
                </p>
              )}
              <Link
                href={`/projects/${code}/blockers`}
                className="text-danger-ink mt-1 inline-block text-[12.5px] font-semibold underline underline-offset-4"
              >
                Manage blocker
              </Link>
            </div>
          )}
        </div>

        <div className="border-line min-w-0 border-t pt-4 lg:col-start-1 lg:row-start-2 lg:pt-3">
          <h2 className="text-muted text-[12px] font-medium leading-4">
            Are we on time for launch?
          </h2>
          {launch.actualLaunchDate ? (
            <>
              <p className="text-success-ink mt-1 text-[14px] font-semibold">
                Live since {formatDate(launch.actualLaunchDate)}
              </p>
              {/* Says how the launch compared with the plan, so an "At risk:
                  past target launch" reason above does not read as a
                  contradiction of "Live". */}
              {launchSlip !== null && (
                <p
                  className={cn(
                    'text-[12.5px]',
                    launchSlip >= 1 ? 'text-warning-ink' : 'text-muted',
                  )}
                >
                  {isToday(launchSlip)
                    ? `Went live on the target date`
                    : launchSlip > 0
                      ? `Went live ${days(launchSlip)} after the target date (${formatDate(launch.targetLaunchDate)})`
                      : `Went live ${days(launchSlip)} ahead of target`}
                </p>
              )}
            </>
          ) : launch.targetLaunchDate ? (
            <>
              <p
                className={cn(
                  'mt-1 text-[14px] font-semibold',
                  late ? 'text-danger-ink' : 'text-ink',
                )}
              >
                {isToday(launch.daysToTarget ?? 0)
                  ? 'Target launch is today'
                  : late
                    ? `${days(launch.daysToTarget!)} past target`
                    : `${days(launch.daysToTarget ?? 0)} to target`}
              </p>
              <p className="text-muted text-[12.5px]">
                Target launch {formatDate(launch.targetLaunchDate)}
              </p>
            </>
          ) : (
            <p className="text-muted mt-1 text-[13px]">
              No target launch date yet.
              {/* Settings is only reachable with project:update, the same grant that edits the next step. */}
              {nextStep.canEdit && (
                <>
                  {' '}
                  <Link
                    href={`/projects/${code}/settings`}
                    className="text-accent-ink underline-offset-4 hover:underline"
                  >
                    Set it in Settings
                  </Link>
                </>
              )}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
