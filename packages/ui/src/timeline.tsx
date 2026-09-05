import * as React from 'react';
import { Check } from 'lucide-react';
import {
  LINEAR_STAGES,
  STAGES,
  STAGE_PHASE_LABEL,
  formatDuration,
  type ProjectStage,
  type StagePhase,
  type Tone,
} from '@relay/core';
import { cn } from './cn';
import { TONE_DOT } from './tone';

export interface StageRailProps {
  current: ProjectStage;
  /** Total time spent in each stage, in ms. Missing entries render blank. */
  durations?: Partial<Record<ProjectStage, number>>;
  /** Stages the project has actually visited, so re-work is visible. */
  visited?: readonly ProjectStage[];
  currentDurationMs?: number;
  className?: string;
}

const PHASE_ORDER: StagePhase[] = ['ONBOARDING', 'BUILD', 'REVIEW', 'LAUNCH'];

/**
 * The stage rail. Seventeen steps is too many for a classic stepper, so the
 * rail groups them by phase, keeps every step addressable, and puts the dwell
 * time under the ones that have one. Re-work shows up as a visited step that
 * sits behind the current one.
 */
export function StageRail({
  current,
  durations = {},
  visited,
  currentDurationMs,
  className,
}: StageRailProps) {
  const currentOrder = STAGES[current].order;
  const onHold = current === 'ON_HOLD_BLOCKED';
  const visitedSet = new Set(visited ?? []);

  return (
    <div className={cn('relative', className)}>
      {/* A fade on the trailing edge, so it is obvious the rail scrolls. */}
      <div
        className="from-surface-1 pointer-events-none absolute inset-y-0 right-0 z-10 w-10 bg-gradient-to-l to-transparent"
        aria-hidden
      />
      <div className="scrollbar-slim overflow-x-auto pb-1">
        <div className="flex min-w-max gap-5">
          {PHASE_ORDER.map((phase) => {
            const stages = LINEAR_STAGES.filter((stage) => STAGES[stage].phase === phase);
            return (
              <div key={phase} className="min-w-max">
                <p className="text-faint mb-2 text-[10.5px] font-semibold uppercase tracking-[0.12em]">
                  {STAGE_PHASE_LABEL[phase]}
                </p>
                <ol className="flex items-start gap-0">
                  {stages.map((stage, index) => {
                    const order = STAGES[stage].order ?? 0;
                    const isCurrent = stage === current;
                    const isDone = currentOrder !== null && order < currentOrder;
                    const wasVisited = visitedSet.has(stage);
                    const duration = isCurrent ? currentDurationMs : durations[stage];

                    return (
                      <li key={stage} className="flex items-start">
                        {index > 0 && (
                          <span
                            className={cn(
                              'mt-3 h-0.5 w-4 shrink-0 rounded-full',
                              isDone || isCurrent ? 'bg-accent/45' : 'bg-line',
                            )}
                            aria-hidden
                          />
                        )}
                        <div className="flex w-[80px] flex-col items-center text-center">
                          <span
                            className={cn(
                              'grid size-6 place-items-center rounded-full border-2 text-[10px] font-bold transition-colors',
                              isCurrent &&
                                !onHold &&
                                'border-accent bg-accent pulse-ring text-white',
                              isCurrent && onHold && 'border-warning bg-warning text-white',
                              isDone && 'border-accent/60 bg-accent/15 text-accent-ink',
                              !isDone &&
                                !isCurrent &&
                                wasVisited &&
                                'border-line-strong bg-surface-2 text-muted',
                              !isDone &&
                                !isCurrent &&
                                !wasVisited &&
                                'border-line bg-surface-1 text-faint',
                            )}
                            aria-current={isCurrent ? 'step' : undefined}
                          >
                            {isDone ? <Check className="size-3" /> : order}
                          </span>
                          <span
                            className={cn(
                              'mt-1.5 text-[11.5px] leading-4',
                              isCurrent ? 'text-ink font-semibold' : 'text-muted',
                            )}
                          >
                            {STAGES[stage].shortLabel}
                          </span>
                          {duration !== undefined && duration > 0 && (
                            <span
                              className={cn(
                                'tabular mt-0.5 text-[10.5px]',
                                isCurrent ? 'text-accent-ink font-medium' : 'text-faint',
                              )}
                            >
                              {formatDuration(duration, { compact: true })}
                            </span>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export interface TimelineItemProps {
  tone?: Tone;
  icon?: React.ReactNode;
  title: React.ReactNode;
  meta?: React.ReactNode;
  children?: React.ReactNode;
  /** Renders the connector below. Set false on the last item. */
  connector?: boolean;
}

export function Timeline({ className, ...rest }: React.HTMLAttributes<HTMLOListElement>) {
  return <ol className={cn('relative', className)} {...rest} />;
}

export function TimelineItem({
  tone = 'neutral',
  icon,
  title,
  meta,
  children,
  connector = true,
}: TimelineItemProps) {
  return (
    <li className="relative flex gap-3.5 pb-5 last:pb-0">
      {connector && (
        <span className="bg-line absolute bottom-0 left-[13px] top-7 w-px" aria-hidden />
      )}
      <span
        className={cn(
          'ring-surface-1 relative z-10 mt-0.5 grid size-7 shrink-0 place-items-center rounded-full ring-4',
          icon ? 'bg-surface-2 text-muted' : TONE_DOT[tone],
        )}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <p className="text-ink min-w-0 text-[13.5px] font-medium leading-5">{title}</p>
          {meta && <span className="text-faint shrink-0 text-[11.5px]">{meta}</span>}
        </div>
        {children && <div className="text-muted mt-1 text-[13px] leading-5">{children}</div>}
      </div>
    </li>
  );
}
