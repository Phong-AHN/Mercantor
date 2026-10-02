import { CalendarClock, ExternalLink, PartyPopper } from 'lucide-react';
import { formatDate, STAGES, type ProjectStage, type Team } from '@relay/core';
import { AvatarStack, cn, StageProgress } from '@relay/ui';
import { StagePill } from '@/components/domain';
import { progressSteps } from '@/app/(app)/projects/[code]/project-hero';

export interface PortalHeroProps {
  name: string;
  stage: ProjectStage;
  visitedStages: readonly ProjectStage[];
  currentPlatform: string | null;
  website: string | null;
  targetLaunchDate: Date | null;
  actualLaunchDate: Date | null;
  daysToTarget: number | null;
  people: ReadonlyArray<{ name: string; team: Team }>;
  /** The project's cover, else the new storefront from a comparison shared with the merchant. */
  image: { src: string } | null;
}

/**
 * The merchant's banner: their store, where the move is, and when it goes
 * live - over the project's cover or their new storefront when there is one.
 *
 * Same rail as the agency hero, in the merchant's words. A missed target is
 * shown as the date, not as "N days late": the merchant reads this page to
 * know what happens next, and the team owns telling them about a new date.
 */
export function PortalHero(props: PortalHeroProps) {
  const onImage = props.image !== null;
  const steps = progressSteps(props.stage, props.visitedStages);
  const currentIndex = steps.findIndex((step) => step.state === 'current');
  const soft = onImage ? 'text-white/80' : 'text-muted';
  const strong = onImage ? 'text-white' : 'text-ink';

  const launch = props.actualLaunchDate
    ? { label: 'Live since', value: formatDate(props.actualLaunchDate), note: null }
    : props.targetLaunchDate
      ? {
          label: 'Target launch',
          value: formatDate(props.targetLaunchDate),
          note:
            props.daysToTarget !== null && props.daysToTarget > 0
              ? `in ${props.daysToTarget} day${props.daysToTarget === 1 ? '' : 's'}`
              : props.daysToTarget === 0
                ? 'today'
                : null,
        }
      : { label: 'Target launch', value: 'To be confirmed', note: null };

  return (
    <header
      className={cn(
        'border-line relative isolate overflow-hidden rounded-[var(--radius-lg)] border',
        onImage ? 'bg-[#0b0d12]' : 'from-accent-soft via-surface-1 to-surface-1 bg-gradient-to-br',
      )}
    >
      {props.image && (
        <>
          {/* Decorative: the store name is the heading. */}
          <img
            src={props.image.src}
            alt=""
            className="absolute inset-0 -z-20 size-full object-cover object-top"
          />
          {/* Fixed dark tones in both themes, so white text clears contrast on any image. */}
          <div
            className="absolute inset-0 -z-10 bg-gradient-to-t from-black/90 via-black/60 to-black/25 sm:bg-gradient-to-r sm:from-black/85 sm:via-black/65 sm:to-black/20"
            aria-hidden
          />
        </>
      )}

      <div className="flex flex-col gap-6 p-5 sm:min-h-[260px] sm:justify-between sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="min-w-0 max-w-2xl">
            <p className={cn('text-[12px] font-medium uppercase tracking-[0.08em]', soft)}>
              Your move to SHOPLINE
            </p>
            <h1
              className={cn(
                'mt-1.5 text-[26px] font-semibold leading-8 tracking-tight [overflow-wrap:anywhere] [text-wrap:balance] sm:text-[32px] sm:leading-10',
                strong,
              )}
            >
              {props.name}
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <StagePill stage={props.stage} showPhase />
              {props.currentPlatform && (
                <span className={cn('text-[13px] font-medium', soft)}>
                  {props.currentPlatform} <span aria-hidden>→</span>
                  <span className="sr-only">to</span> SHOPLINE
                </span>
              )}
              {props.website && (
                <a
                  href={props.website}
                  target="_blank"
                  rel="noreferrer noopener"
                  className={cn(
                    'inline-flex items-center gap-1 text-[13px] underline-offset-4 hover:underline',
                    onImage ? 'text-white' : 'text-accent-ink',
                  )}
                >
                  {props.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                  <ExternalLink className="size-3" aria-hidden />
                </a>
              )}
            </div>
          </div>

          <div
            className={cn(
              'rounded-[var(--radius-md)] px-4 py-3',
              onImage
                ? 'bg-white/10 ring-1 ring-white/20 backdrop-blur-sm'
                : 'bg-surface-1 ring-line shadow-card ring-1',
            )}
          >
            <p className={cn('text-[11.5px] font-medium', soft)}>{launch.label}</p>
            <p className={cn('mt-0.5 flex items-center gap-1.5 text-[17px] font-semibold', strong)}>
              {props.actualLaunchDate ? (
                <PartyPopper className="size-4 opacity-90" aria-hidden />
              ) : (
                <CalendarClock className="size-4 opacity-80" aria-hidden />
              )}
              {launch.value}
            </p>
            {launch.note && <p className={cn('mt-0.5 text-[12px]', soft)}>{launch.note}</p>}
          </div>
        </div>

        <div className="grid items-end gap-x-8 gap-y-4 sm:grid-cols-[minmax(0,1fr)_auto]">
          <div className="min-w-0">
            <p className={cn('mb-2 text-[13px]', soft)}>
              <span className={cn('font-semibold', strong)}>
                {currentIndex >= 0
                  ? `Step ${currentIndex + 1} of ${steps.length}`
                  : STAGES[props.stage].label}
              </span>
              {currentIndex >= 0 && <> · {STAGES[props.stage].label}</>}
              <span className="max-sm:hidden"> - {STAGES[props.stage].description}</span>
            </p>
            <StageProgress steps={steps} onImage={onImage} className="max-w-2xl" />
          </div>
          {props.people.length > 0 && (
            <div>
              <p className={cn('mb-1 text-[11.5px] font-medium', soft)}>Your team</p>
              <span className={cn('inline-flex', onImage && 'rounded-full bg-white/90 p-0.5')}>
                <AvatarStack people={props.people} max={5} />
              </span>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
