import * as React from 'react';
import { initials, type Team } from '@relay/core';
import { cn } from './cn';

const TEAM_RING: Record<Team, string> = {
  AHN: 'ring-team-ahn/45 bg-team-ahn/12 text-team-ahn',
  SHOPLINE: 'ring-team-shopline/45 bg-team-shopline/12 text-team-shopline',
  MERCHANT: 'ring-team-merchant/45 bg-team-merchant/14 text-team-merchant',
  OTHER: 'ring-line-strong bg-surface-2 text-muted',
};

const SIZE = {
  xs: 'size-5 text-[9px]',
  sm: 'size-6 text-[10px]',
  md: 'size-8 text-[11px]',
  lg: 'size-10 text-[13px]',
} as const;

export interface AvatarProps {
  name: string;
  team?: Team;
  size?: keyof typeof SIZE;
  className?: string;
  title?: string;
}

/**
 * Initials, tinted by team. No uploads: an avatar that always renders beats an
 * avatar that is usually a broken image.
 */
export function Avatar({ name, team = 'OTHER', size = 'md', className, title }: AvatarProps) {
  return (
    <span
      title={title ?? name}
      aria-label={name}
      className={cn(
        'inline-grid shrink-0 select-none place-items-center rounded-full font-semibold ring-1',
        SIZE[size],
        TEAM_RING[team],
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}

export function AvatarStack({
  people,
  max = 4,
  size = 'sm',
  className,
}: {
  people: readonly { name: string; team?: Team }[];
  max?: number;
  size?: keyof typeof SIZE;
  className?: string;
}) {
  const shown = people.slice(0, max);
  const overflow = people.length - shown.length;
  return (
    <div className={cn('flex items-center -space-x-1.5', className)}>
      {shown.map((person, index) => (
        <Avatar
          key={`${person.name}-${index}`}
          name={person.name}
          team={person.team}
          size={size}
          className="ring-surface-1 ring-2"
        />
      ))}
      {overflow > 0 && (
        <span
          className={cn(
            'bg-surface-3 text-muted ring-surface-1 inline-grid place-items-center rounded-full font-semibold ring-2',
            SIZE[size],
          )}
        >
          +{overflow}
        </span>
      )}
    </div>
  );
}

/** Avatar plus name and role - the standard "who owns this" cell. */
export function PersonCell({
  name,
  role,
  team,
  size = 'md',
  className,
}: {
  name: string;
  role?: string;
  team?: Team;
  size?: keyof typeof SIZE;
  className?: string;
}) {
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-2', className)}>
      <Avatar name={name} team={team} size={size} />
      <span className="min-w-0">
        <span className="text-ink block truncate text-[13px] font-medium leading-4">{name}</span>
        {role && <span className="text-muted block truncate text-[11.5px] leading-4">{role}</span>}
      </span>
    </span>
  );
}

export function Unassigned({ label = 'Unassigned' }: { label?: string }) {
  return (
    <span className="text-faint inline-flex items-center gap-2 text-[13px]">
      <span className="border-line-strong grid size-8 place-items-center rounded-full border border-dashed text-[11px]">
        ?
      </span>
      {label}
    </span>
  );
}
