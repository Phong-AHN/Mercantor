import Link from 'next/link';
import { ImageOff } from 'lucide-react';
import {
  ENGAGEMENT_TYPE_LABEL,
  STAGES,
  STAGE_PHASE_LABEL,
  STOREFRONT_PLATFORM_LABEL,
  type ProjectStage,
  type Tone,
} from '@relay/core';
import { describeMetric, formatMetricValue, metricFreshness } from '@relay/storefront';
import {
  BeforeAfter,
  Chip,
  ChipRow,
  cn,
  FindingsLink,
  MetricDelta,
  MetricRow,
  StackLine,
} from '@relay/ui';
import { captureSrc, type ShowcaseProject } from '@/features/qa/queries';

const PHASE_TONE: Record<string, Tone> = {
  ONBOARDING: 'info',
  BUILD: 'warning',
  REVIEW: 'accent',
  LAUNCH: 'success',
  OFF_TRACK: 'danger',
};

export function stageChip(stage: ProjectStage) {
  const phase = STAGES[stage].phase;
  return { label: STAGE_PHASE_LABEL[phase], tone: PHASE_TONE[phase] ?? 'neutral' };
}

export interface ShowcaseCardProps {
  project: ShowcaseProject;
  href: string;
  findingsHref: string;
  now: Date;
  /** The overview page shows one large card; the gallery shows many. */
  size?: 'gallery' | 'hero';
}

/**
 * One project, the way the reference showcase presents it: the before/after
 * wipe first, then who and what, then three measured numbers, then the way
 * into the findings. Everything on it is something the reader can check.
 */
export function ShowcaseCard({ project, href, findingsHref, now, size = 'gallery' }: ShowcaseCardProps) {
  const profile = project.storefront!;
  const pair = project.comparisons[0];
  const stage = stageChip(project.stage);
  const apps = Array.isArray(profile.detectedApps)
    ? (profile.detectedApps as Array<{ name?: string }>)
        .map((app) => app?.name)
        .filter((name): name is string => typeof name === 'string')
    : [];
  const theme = [profile.themeName, profile.themeVersion].filter(Boolean).join(' ');
  const from = `${STOREFRONT_PLATFORM_LABEL[profile.sourcePlatform].label}${theme ? ` (${theme})` : ''}`;
  const to = profile.destinationBuildLabel ?? STOREFRONT_PLATFORM_LABEL[profile.destinationPlatform].label;

  return (
    <article
      className={cn(
        'border-line bg-surface-1 shadow-card overflow-hidden rounded-[var(--radius-lg)] border',
        size === 'hero' && 'lg:grid lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]',
      )}
    >
      <div className={cn('bg-surface-2 p-3', size === 'hero' && 'lg:p-4')}>
        {pair ? (
          <BeforeAfter
            before={{
              src: captureSrc(pair.beforeCapture.id),
              alt: `${project.merchant.name} ${pair.label} before`,
            }}
            after={{
              src: captureSrc(pair.afterCapture.id),
              alt: `${project.merchant.name} ${pair.label} after`,
            }}
            afterLabel={pair.afterLabel}
            aspectRatio={pair.beforeCapture.viewport === 'MOBILE' ? 9 / 16 : 16 / 10}
          />
        ) : (
          <div className="border-line text-muted grid aspect-[16/10] place-items-center rounded-[var(--radius-lg)] border border-dashed text-center text-[12.5px]">
            <span className="flex flex-col items-center gap-2 px-6">
              <ImageOff className="size-5" />
              No before and after yet
            </span>
          </div>
        )}
      </div>

      <div className={cn('space-y-4 p-5', size === 'hero' && 'lg:p-6')}>
        <div className="space-y-2.5">
          <ChipRow>
            {profile.engagementType && (
              <Chip emphasis="primary">{ENGAGEMENT_TYPE_LABEL[profile.engagementType].label}</Chip>
            )}
            <Chip dot tone={stage.tone}>
              {stage.label}
            </Chip>
            {profile.serviceTags.map((tag) => (
              <Chip key={tag}>{tag}</Chip>
            ))}
          </ChipRow>
          <h3 className="text-ink text-[19px] font-semibold leading-tight tracking-tight">
            <Link href={href} className="hover:text-accent-ink transition-colors">
              {project.merchant.name}
            </Link>
          </h3>
          {profile.headline && <p className="text-ink-soft text-[14px] leading-snug">{profile.headline}</p>}
          <StackLine from={from} apps={apps} to={to} />
        </div>

        {project.showcaseMetrics.length > 0 && (
          <MetricRow>
            {project.showcaseMetrics.map((metric) => {
              const delta = describeMetric({
                label: metric.label,
                before: metric.beforeValue,
                after: metric.afterValue,
                unit: metric.unit,
                direction: metric.direction,
              });
              return (
                <MetricDelta
                  key={metric.id}
                  label={metric.label}
                  before={metric.beforeValue == null ? null : formatMetricValue(metric.beforeValue, metric.unit)}
                  after={formatMetricValue(metric.afterValue, metric.unit)}
                  improved={delta.improved}
                  staleDays={metric.measuredAt ? metricFreshness(metric.measuredAt, now).days : null}
                />
              );
            })}
          </MetricRow>
        )}

        {size === 'hero' && profile.summary && (
          <p className="text-muted max-w-prose whitespace-pre-line text-[13.5px] leading-relaxed">
            {profile.summary}
          </p>
        )}

        <div className="border-line flex items-center justify-between gap-3 border-t pt-3">
          <FindingsLink count={project._count.findings} href={findingsHref} />
          <span className="text-muted text-[12px] tabular-nums">
            {project.comparisons.length} comparison{project.comparisons.length === 1 ? '' : 's'}
          </span>
        </div>
      </div>
    </article>
  );
}
