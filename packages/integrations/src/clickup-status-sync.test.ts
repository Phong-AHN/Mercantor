import { describe, expect, it } from 'vitest';
import { clickUpStatusForTrackedStage, stageForClickUpStatus } from './clickup';

const TRACKED = ['INTRODUCTION', 'MERCHANT_CONTACTED', 'DEPLOYED_LIVE'] as const;

describe('clickUpStatusForTrackedStage', () => {
  it('returns the stage label for a tracked stage', () => {
    expect(clickUpStatusForTrackedStage('INTRODUCTION', TRACKED)).toBe('Introduction');
    expect(clickUpStatusForTrackedStage('DEPLOYED_LIVE', TRACKED)).toBe('Deployed / Live');
  });

  it('returns null for a stage the project does not track', () => {
    expect(clickUpStatusForTrackedStage('DESIGN', TRACKED)).toBeNull();
  });
});

describe('stageForClickUpStatus', () => {
  it('matches a tracked stage by its exact label, case-insensitively', () => {
    expect(stageForClickUpStatus('Introduction', TRACKED)).toBe('INTRODUCTION');
    expect(stageForClickUpStatus('introduction', TRACKED)).toBe('INTRODUCTION');
    expect(stageForClickUpStatus('  DEPLOYED / LIVE  ', TRACKED)).toBe('DEPLOYED_LIVE');
  });

  it('returns null for a status the project does not track', () => {
    expect(stageForClickUpStatus('Design', TRACKED)).toBeNull();
  });

  it('returns null for an empty tracked set', () => {
    expect(stageForClickUpStatus('Introduction', [])).toBeNull();
  });

  it('round-trips every stage label back to itself for the full stage set', () => {
    // Guards the core correctness claim: as long as a project's tracked set
    // is what it is, going stage -> label -> stage is always exact, never
    // ambiguous, no matter which stages are chosen.
    const everyLabel = [
      'INTRODUCTION',
      'DESIGN',
      'MERCHANT_QA',
      'READY_FOR_SHOPLINE_REVIEW',
      'COMPLETED',
    ] as const;
    for (const stage of everyLabel) {
      const label = clickUpStatusForTrackedStage(stage, everyLabel);
      expect(label).not.toBeNull();
      expect(stageForClickUpStatus(label!, everyLabel)).toBe(stage);
    }
  });
});
