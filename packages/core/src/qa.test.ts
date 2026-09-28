import { describe, expect, it } from 'vitest';
import { FINDING_STATUSES, findingTransition, nextFindingStatuses } from './qa';

describe('findingTransition', () => {
  it('allows the forward workflow', () => {
    expect(findingTransition('NEW', 'REVIEWED').ok).toBe(true);
    expect(findingTransition('REVIEWED', 'IN_PROGRESS').ok).toBe(true);
    expect(findingTransition('IN_PROGRESS', 'READY_FOR_VERIFICATION').ok).toBe(true);
    expect(findingTransition('READY_FOR_VERIFICATION', 'RESOLVED', { note: 'Checked live' }).ok).toBe(true);
  });

  it('refuses to resolve without a verification note', () => {
    expect(findingTransition('READY_FOR_VERIFICATION', 'RESOLVED', { note: '  ' }).ok).toBe(false);
  });

  it('refuses to resolve straight from new', () => {
    expect(findingTransition('NEW', 'RESOLVED', { note: 'x' }).ok).toBe(false);
  });

  it('requires a reason to dismiss', () => {
    expect(findingTransition('NEW', 'DISMISSED').ok).toBe(false);
    expect(findingTransition('NEW', 'DISMISSED', { reason: 'False positive' }).ok).toBe(true);
  });

  it('lets a resolved or dismissed finding be reopened', () => {
    expect(findingTransition('RESOLVED', 'IN_PROGRESS').ok).toBe(true);
    expect(findingTransition('DISMISSED', 'NEW').ok).toBe(true);
  });

  it('never offers a no-op move', () => {
    for (const status of FINDING_STATUSES) {
      expect(nextFindingStatuses(status)).not.toContain(status);
    }
  });
});
