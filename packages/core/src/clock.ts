/**
 * Time is injected, never read straight from the platform, so every SLA and
 * ageing calculation in this package is deterministic under test.
 * `new Date()` with no arguments is banned by ESLint everywhere but here.
 */
export interface Clock {
  now(): Date;
}

const systemClock: Clock = { now: () => new Date() };

let current: Clock = systemClock;

export const clock: Clock = {
  now: () => current.now(),
};

export function setClock(next: Clock): void {
  current = next;
}

export function resetClock(): void {
  current = systemClock;
}

export function fixedClock(at: Date | string): Clock {
  const frozen = typeof at === 'string' ? new Date(at) : at;
  return { now: () => new Date(frozen.getTime()) };
}
