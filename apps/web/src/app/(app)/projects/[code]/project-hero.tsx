import { CalendarClock, ExternalLink, Store } from 'lucide-react';
import {
  formatDate,
  formatDays,
  formatDuration,
  LINEAR_STAGES,
  STAGE_PHASE_LABEL,
  STAGES,
  type MigrationType,
  type ProjectStage,
  type Team,
} from '@relay/core';
import { AvatarStack, cn, Mono, StageProgress, type StageProgressStep } from '@relay/ui';
import { MigrationTypePill, StagePill } from '@/components/domain';
import { CoverControls } from './cover-controls';

export interface ProjectHeroProps {
  code: string;
  name: string;
  stage: ProjectStage;
  /** Stages this project has been in, used to place an off-track project on the rail. */
  visitedStages: readonly ProjectStage[];
  migrationType: MigrationType;
  startDate: Date;
  ageMs: number;
  currentPlatform: string | null;
  shoplineStoreId: string | null;
  website: string | null;
  targetLaunchDate: Date | null;
  actualLaunchDate: Date | null;
  daysToTarget: number | null;
  people: ReadonlyArray<{ name: string; team: Team }>;
  /** Cover upload, else the latest storefront screenshot, else nothing. */
  image: { src: string; source: 'cover' | 'capture' } | null;
  hasCover: boolean;
  hasCapture: boolean;
  canEditCover: boolean;
  actions: React.ReactNode;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter((word) => /^[\p{L}\p{N}]/u.test(word))
    .slice(0, 2)
    .map((word) => word[0]!.toUpperCase())
    .join('');
}

export function progressSteps(
  stage: ProjectStage,
  visited: readonly ProjectStage[],
): StageProgressStep[] {
  // An off-track stage (on hold) has no place on the rail; show the furthest
  // linear stage the project reached instead.
  const reached =
    STAGES[stage].order ??
    Math.max(0, ...visited.map((visitedStage) => STAGES[visitedStage].order ?? 0));
  return LINEAR_STAGES.map((linear) => {
    const order = STAGES[linear].order ?? 0;
    return {
      key: linear,
      label: STAGES[linear].label,
      phase: STAGE_PHASE_LABEL[STAGES[linear].phase],
      state: order < reached ? 'done' : order === reached ? 'current' : 'upcoming',
    };
  });
}

/**
 * The top of every project page: who the project is (name, code, platform,
 * store, team), where it is on its track, and when it launches - over the
 * project's own cover or storefront screenshot when there is one. Kept to
 * about 220px so the status band below stays the place to act from.
 */
export function ProjectHero(props: ProjectHeroProps) {
  const onImage = props.image !== null;
  const late = props.daysToTarget !== null && props.daysToTarget < 0;
  const steps = progressSteps(props.stage, props.visitedStages);
  const currentIndex = steps.findIndex((step) => step.state === 'current');

  const soft = onImage ? 'text-white/80' : 'text-muted';
  const strong = onImage ? 'text-white' : 'text-ink';

  return (
    <header
      className={cn(
        'border-line relative isolate overflow-hidden rounded-[var(--radius-lg)] border',
        onImage ? 'bg-[#0b0d12]' : 'bg-surface-1',
      )}
    >
      {props.image ? (
        <>
          {/* Decorative: the project name is the heading, the screenshot is backdrop. */}
          <img
            src={props.image.src}
            alt=""
            className="absolute inset-0 -z-20 size-full object-cover object-top"
          />
          {/* Legibility scrim: fixed dark tones, the same in both themes, so the
              white text always clears contrast whatever the image is. */}
          <div
            className="absolute inset-0 -z-10 bg-gradient-to-r from-black/85 via-black/70 to-black/35 max-sm:bg-black/80 max-sm:bg-none"
            aria-hidden
          />
        </>
      ) : (
        <span
          className="text-accent/[0.07] pointer-events-none absolute -right-2 -top-6 -z-10 select-none text-[180px] font-bold leading-none tracking-tighter max-sm:hidden"
          aria-hidden
        >
          {initials(props.name)}
        </span>
      )}

      <div className="flex flex-col justify-between gap-4 p-4 sm:min-h-[220px] sm:gap-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 max-w-full">
            <p
              className={cn(
                'flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] font-medium',
                soft,
              )}
            >
              <Mono className={cn(onImage && 'border-white/20 bg-white/10 text-white')}>
                {props.code}
              </Mono>
              <span>Started {formatDate(props.startDate)}</span>
              <span aria-hidden>·</span>
              <span>{formatDuration(props.ageMs, { compact: true })} old</span>
            </p>
            <h1
              className={cn(
                'mt-1.5 text-[24px] font-semibold leading-8 tracking-tight [overflow-wrap:anywhere] [text-wrap:balance] sm:text-[28px] sm:leading-9',
                strong,
              )}
            >
              {props.name}
            </h1>
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <StagePill stage={props.stage} showPhase />
              <MigrationTypePill type={props.migrationType} />
              {props.currentPlatform && (
                <span className={cn('text-[12.5px] font-medium', soft)}>
                  {props.currentPlatform} <span aria-hidden>→</span>
                  <span className="sr-only">to</span> SHOPLINE
                </span>
              )}
              {props.shoplineStoreId && (
                <span className={cn('inline-flex items-center gap-1 text-[12.5px]', soft)}>
                  <Store className="size-3.5" aria-hidden />
                  {props.shoplineStoreId}
                </span>
              )}
              {props.website && (
                <a
                  href={props.website}
                  target="_blank"
                  rel="noreferrer noopener"
                  className={cn(
                    'inline-flex items-center gap-1 text-[12.5px] underline-offset-4 hover:underline',
                    onImage ? 'text-white' : 'text-accent-ink',
                  )}
                >
                  {props.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                  <ExternalLink className="size-3" aria-hidden />
                </a>
              )}
            </div>
          </div>
          <div className="flex max-w-full flex-wrap items-center gap-2">{props.actions}</div>
        </div>

        <div className="grid items-end gap-x-8 gap-y-4 sm:grid-cols-[minmax(0,1fr)_auto]">
          <div className="min-w-0">
            <p className={cn('mb-2 text-[12.5px]', soft)}>
              <span className={cn('font-semibold', strong)}>
                Step {currentIndex + 1} of {steps.length}
              </span>{' '}
              · {STAGES[props.stage].label}
            </p>
            <StageProgress steps={steps} onImage={onImage} className="max-w-2xl" />
          </div>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <div className="min-w-0">
              <p className={cn('text-[11.5px] font-medium', soft)}>
                {props.actualLaunchDate ? 'Went live' : 'Target launch'}
              </p>
              <p className={cn('flex items-center gap-1.5 text-[14px] font-semibold', strong)}>
                <CalendarClock className="size-3.5 opacity-80" aria-hidden />
                {props.actualLaunchDate
                  ? formatDate(props.actualLaunchDate)
                  : props.targetLaunchDate
                    ? formatDate(props.targetLaunchDate)
                    : 'Not set'}
                {!props.actualLaunchDate && late && (
                  <span
                    className={cn(
                      'rounded-full px-1.5 py-0.5 text-[11px] font-semibold',
                      onImage ? 'bg-red-500/85 text-white' : 'bg-danger-soft text-danger-ink',
                    )}
                  >
                    {formatDays(props.daysToTarget!)} late
                  </span>
                )}
              </p>
            </div>
            {/* Hidden on phones: the Overview's "Who is on this" names everyone,
                and the hero has to stay short there. */}
            {props.people.length > 0 && (
              <div className="max-sm:hidden">
                <p className={cn('mb-1 text-[11.5px] font-medium', soft)}>Team</p>
                {/* On a photo the stack sits on a light pill so the initials keep
                    their contrast instead of floating on the image. */}
                <span className={cn('inline-flex', onImage && 'rounded-full bg-white/90 p-0.5')}>
                  <AvatarStack people={props.people} max={5} />
                </span>
              </div>
            )}
            {props.canEditCover && (
              <CoverControls
                code={props.code}
                hasCover={props.hasCover}
                hasFallback={props.hasCapture}
                onImage={onImage}
              />
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
