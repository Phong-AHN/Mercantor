import type { Team, Tone } from '@relay/core';

/**
 * One place where a semantic tone becomes colour. Components take a `Tone` and
 * never a colour, so restyling "warning" everywhere is one edit here.
 */

export const TONE_SOFT: Record<Tone, string> = {
  neutral: 'bg-neutral-soft text-neutral-ink',
  muted: 'bg-surface-2 text-muted',
  info: 'bg-info-soft text-info-ink',
  success: 'bg-success-soft text-success-ink',
  warning: 'bg-warning-soft text-warning-ink',
  danger: 'bg-danger-soft text-danger-ink',
  accent: 'bg-accent-soft text-accent-ink',
};

export const TONE_SOLID: Record<Tone, string> = {
  neutral: 'bg-ink text-canvas',
  muted: 'bg-line-strong text-ink',
  info: 'bg-info text-white',
  success: 'bg-success text-white',
  warning: 'bg-warning text-white',
  danger: 'bg-danger text-white',
  accent: 'bg-accent text-white',
};

export const TONE_TEXT: Record<Tone, string> = {
  neutral: 'text-ink',
  muted: 'text-muted',
  info: 'text-info-ink',
  success: 'text-success-ink',
  warning: 'text-warning-ink',
  danger: 'text-danger-ink',
  accent: 'text-accent-ink',
};

export const TONE_DOT: Record<Tone, string> = {
  neutral: 'bg-neutral-ink',
  muted: 'bg-faint',
  info: 'bg-info',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  accent: 'bg-accent',
};

export const TONE_BORDER: Record<Tone, string> = {
  neutral: 'border-line',
  muted: 'border-line',
  info: 'border-info/35',
  success: 'border-success/35',
  warning: 'border-warning/35',
  danger: 'border-danger/40',
  accent: 'border-accent/35',
};

export const TONE_BAR: Record<Tone, string> = {
  neutral: 'bg-neutral-ink',
  muted: 'bg-line-strong',
  info: 'bg-info',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  accent: 'bg-accent',
};

/** For SVG line/point charts - the same tones as `TONE_BAR`, as stroke/fill. */
export const TONE_STROKE: Record<Tone, string> = {
  neutral: 'stroke-neutral-ink',
  muted: 'stroke-line-strong',
  info: 'stroke-info',
  success: 'stroke-success',
  warning: 'stroke-warning',
  danger: 'stroke-danger',
  accent: 'stroke-accent',
};

export const TONE_FILL: Record<Tone, string> = {
  neutral: 'fill-neutral-ink',
  muted: 'fill-line-strong',
  info: 'fill-info',
  success: 'fill-success',
  warning: 'fill-warning',
  danger: 'fill-danger',
  accent: 'fill-accent',
};

export const TEAM_BAR: Record<Team, string> = {
  AHN: 'bg-team-ahn',
  SHOPLINE: 'bg-team-shopline',
  MERCHANT: 'bg-team-merchant',
  OTHER: 'bg-team-other',
};

export const TEAM_TEXT: Record<Team, string> = {
  AHN: 'text-team-ahn',
  SHOPLINE: 'text-team-shopline',
  MERCHANT: 'text-team-merchant',
  OTHER: 'text-team-other',
};
