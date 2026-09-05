import Link from 'next/link';
import {
  AGING_BAND_LABEL,
  formatDate,
  formatDuration,
  HEALTH_LABEL,
  MIGRATION_TYPE_LABEL,
  STAGES,
  type AgingBand,
  type MigrationType,
  type ProjectHealth,
  type ProjectStage,
} from '@relay/core';
import { Badge, cn, StatusPill } from '@relay/ui';

/**
 * Domain chips. Every screen renders a stage, a health and an ageing band the
 * same way, because they all come through here rather than being restyled per
 * page.
 */

const PHASE_TONE = {
  ONBOARDING: 'info',
  BUILD: 'accent',
  REVIEW: 'warning',
  LAUNCH: 'success',
  OFF_TRACK: 'danger',
} as const;

export function StagePill({
  stage,
  size = 'md',
  showPhase,
}: {
  stage: ProjectStage;
  size?: 'sm' | 'md';
  showPhase?: boolean;
}) {
  const descriptor = STAGES[stage];
  return (
    <Badge
      tone={PHASE_TONE[descriptor.phase]}
      size={size}
      dot
      title={descriptor.description}
      className="max-w-full"
    >
      <span className="truncate">{showPhase ? descriptor.label : descriptor.shortLabel}</span>
    </Badge>
  );
}

export function HealthPill({
  health,
  size = 'md',
  reason,
}: {
  health: ProjectHealth;
  size?: 'sm' | 'md';
  reason?: string;
}) {
  const descriptor = HEALTH_LABEL[health];
  return (
    <Badge tone={descriptor.tone} size={size} dot title={reason ?? descriptor.hint}>
      {descriptor.label}
    </Badge>
  );
}

export function AgingPill({
  band,
  ageMs,
  size = 'md',
}: {
  band: AgingBand;
  ageMs: number;
  size?: 'sm' | 'md';
}) {
  const descriptor = AGING_BAND_LABEL[band];
  return (
    <Badge tone={descriptor.tone} size={size} variant="outline" title={descriptor.hint}>
      <span className="tabular">{formatDuration(ageMs, { compact: true })}</span>
    </Badge>
  );
}

export function MigrationTypePill({
  type,
  size = 'md',
}: {
  type: MigrationType;
  size?: 'sm' | 'md';
}) {
  return <StatusPill descriptor={MIGRATION_TYPE_LABEL[type]} size={size} dot={false} />;
}

/**
 * `linked` defaults to true (its own `<a>`) for the common case: a cell or a
 * row that is not already a link. Pass `linked={false}` inside a row that is
 * already wrapped in its own `<Link>` - an anchor cannot contain another
 * anchor, and a browser silently restructures the DOM when it finds one,
 * which is what produced a real hydration mismatch on the dashboard (D-035).
 */
export function ProjectLink({
  code,
  name,
  className,
  linked = true,
}: {
  code: string;
  name: string;
  className?: string;
  linked?: boolean;
}) {
  const content = (
    <>
      <span className="text-ink group-hover:text-accent-ink truncate text-[13.5px] font-semibold leading-5">
        {name}
      </span>
      <span className="text-faint font-mono text-[11px] leading-4">{code}</span>
    </>
  );

  if (!linked) {
    return <div className={cn('group inline-flex min-w-0 flex-col', className)}>{content}</div>;
  }

  return (
    <Link
      href={`/projects/${code}`}
      className={cn('group inline-flex min-w-0 flex-col', className)}
    >
      {content}
    </Link>
  );
}

/**
 * A due date that says what it means: overdue dates are red, imminent ones
 * amber. Rendered on the server with an explicit `now` so it is deterministic.
 */
export function DueDate({
  date,
  now,
  prefix,
}: {
  date: Date | null | undefined;
  now: Date;
  prefix?: string;
}) {
  if (!date) return <span className="text-faint">-</span>;
  const days = (date.getTime() - now.getTime()) / 86_400_000;
  const tone = days < 0 ? 'text-danger-ink' : days <= 3 ? 'text-warning-ink' : 'text-ink-soft';
  return (
    <span className={cn('tabular text-[12.5px]', tone)}>
      {prefix ? `${prefix} ` : ''}
      {formatDate(date)}
      {days < 0 && <span className="ml-1 font-medium">({Math.abs(Math.floor(days))}d late)</span>}
    </span>
  );
}

/** A count that reads as nothing when it is zero, instead of a loud "0". */
export function CountOrDash({ value, tone }: { value: number; tone?: 'danger' | 'warning' }) {
  if (value === 0) return <span className="text-faint">-</span>;
  return (
    <span
      className={cn(
        'tabular font-medium',
        tone === 'danger'
          ? 'text-danger-ink'
          : tone === 'warning'
            ? 'text-warning-ink'
            : 'text-ink',
      )}
    >
      {value}
    </span>
  );
}
