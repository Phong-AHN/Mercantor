import { describe, expect, it } from 'vitest';
import { computeProjectTime, DAY_MS, agingBand, detectOpenBreaches } from './sla';
import { checkTransition, nextLinearStage } from './stages';
import { assessHealth } from './health';

const START = new Date('2026-01-01T00:00:00.000Z');
const day = (n: number) => new Date(START.getTime() + n * DAY_MS);

describe('computeProjectTime', () => {
  it('charges stage time to the stage owner when nothing is blocked', () => {
    const time = computeProjectTime({
      startedAt: START,
      stageSegments: [
        // INTRODUCTION is owned by SHOPLINE, MIGRATION by AHN.
        { stage: 'INTRODUCTION', enteredAt: day(0), exitedAt: day(2) },
        { stage: 'MIGRATION', enteredAt: day(2), exitedAt: null },
      ],
      now: day(6),
    });

    expect(time.byTeam.SHOPLINE).toBe(2 * DAY_MS);
    expect(time.byTeam.AHN).toBe(4 * DAY_MS);
    expect(time.byTeam.MERCHANT).toBe(0);
    expect(time.currentStage).toBe('MIGRATION');
    expect(time.currentStageMs).toBe(4 * DAY_MS);
  });

  it('reattributes blocked time to the blocker owner, never double counting', () => {
    const time = computeProjectTime({
      startedAt: START,
      stageSegments: [{ stage: 'MIGRATION', enteredAt: day(0), exitedAt: null }],
      blockerSegments: [
        { blockerId: 'b1', ownerTeam: 'MERCHANT', startedAt: day(1), endedAt: day(3) },
      ],
      now: day(4),
    });

    expect(time.byTeam.MERCHANT).toBe(2 * DAY_MS);
    expect(time.byTeam.AHN).toBe(2 * DAY_MS);
    expect(time.byTeam.AHN + time.byTeam.MERCHANT).toBe(time.ageMs);
    expect(time.totalBlockedMs).toBe(2 * DAY_MS);
  });

  it('gives an overlapping millisecond to the blocker that opened first', () => {
    const time = computeProjectTime({
      startedAt: START,
      stageSegments: [{ stage: 'MIGRATION', enteredAt: day(0), exitedAt: null }],
      blockerSegments: [
        { blockerId: 'b1', ownerTeam: 'MERCHANT', startedAt: day(1), endedAt: day(3) },
        { blockerId: 'b2', ownerTeam: 'SHOPLINE', startedAt: day(2), endedAt: day(4) },
      ],
      now: day(4),
    });

    expect(time.byTeam.MERCHANT).toBe(2 * DAY_MS);
    expect(time.byTeam.SHOPLINE).toBe(1 * DAY_MS);
    expect(time.byTeam.AHN).toBe(1 * DAY_MS);
  });

  it('hands a blocker timer over when ownership changes', () => {
    const time = computeProjectTime({
      startedAt: START,
      stageSegments: [{ stage: 'DEVELOPMENT', enteredAt: day(0), exitedAt: null }],
      blockerSegments: [
        { blockerId: 'b1', ownerTeam: 'MERCHANT', startedAt: day(1), endedAt: day(2) },
        { blockerId: 'b1', ownerTeam: 'AHN', startedAt: day(2), endedAt: day(5) },
      ],
      now: day(5),
    });

    expect(time.byTeam.MERCHANT).toBe(1 * DAY_MS);
    // 1 day of unblocked development plus 3 days of AHN-owned blocker time.
    expect(time.byTeam.AHN).toBe(4 * DAY_MS);
  });

  it('stops the clock at completion', () => {
    const time = computeProjectTime({
      startedAt: START,
      completedAt: day(10),
      stageSegments: [{ stage: 'COMPLETED', enteredAt: day(0), exitedAt: null }],
      now: day(40),
    });

    expect(time.ageMs).toBe(10 * DAY_MS);
    expect(time.ageDays).toBe(10);
  });

  it('reports days past the target launch date', () => {
    const time = computeProjectTime({
      startedAt: START,
      targetLaunchDate: day(20),
      stageSegments: [{ stage: 'DEVELOPMENT', enteredAt: day(0), exitedAt: null }],
      now: day(26),
    });

    expect(time.onSchedule).toBe(false);
    expect(Math.round(time.daysOverTarget)).toBe(6);
  });

  it('shares add up to 100 percent', () => {
    const time = computeProjectTime({
      startedAt: START,
      stageSegments: [
        { stage: 'INTRODUCTION', enteredAt: day(0), exitedAt: day(1) },
        { stage: 'WAITING_FOR_ACCESS', enteredAt: day(1), exitedAt: day(4) },
        { stage: 'MIGRATION', enteredAt: day(4), exitedAt: null },
      ],
      now: day(9),
    });

    const total = Object.values(time.byTeamPercent).reduce((a, b) => a + b, 0);
    expect(total).toBe(100);
  });
});

describe('detectOpenBreaches', () => {
  it('reports nothing when the project is on track and has no target date', () => {
    const time = computeProjectTime({
      startedAt: START,
      stageSegments: [{ stage: 'DEVELOPMENT', enteredAt: day(0), exitedAt: null }],
      now: day(3),
    });
    expect(detectOpenBreaches(time)).toEqual([]);
  });

  it('opens a STAGE_OVERRUN breach the instant the stage target is crossed, not when this runs', () => {
    // DEVELOPMENT's target is 10 days; the stage has been open 15.
    const time = computeProjectTime({
      startedAt: START,
      stageSegments: [{ stage: 'DEVELOPMENT', enteredAt: day(0), exitedAt: null }],
      now: day(15),
    });

    const breaches = detectOpenBreaches(time);
    expect(breaches).toHaveLength(1);
    expect(breaches[0]).toMatchObject({
      kind: 'STAGE_OVERRUN',
      stage: 'DEVELOPMENT',
      targetDays: 10,
    });
    // Crossed the moment the stage had been open for its 10-day target, not "now".
    expect(breaches[0]?.startedAt).toEqual(day(10));
  });

  it('opens a LAUNCH_OVERRUN breach dated to the target launch date itself', () => {
    const time = computeProjectTime({
      startedAt: START,
      targetLaunchDate: day(20),
      stageSegments: [{ stage: 'DEVELOPMENT', enteredAt: day(0), exitedAt: null }],
      now: day(26),
    });

    const breaches = detectOpenBreaches(time);
    expect(breaches).toContainEqual({
      kind: 'LAUNCH_OVERRUN',
      stage: null,
      targetDays: null,
      startedAt: day(20),
    });
  });

  it('reports both at once when a project is both stuck in stage and past its launch date', () => {
    const time = computeProjectTime({
      startedAt: START,
      targetLaunchDate: day(5),
      stageSegments: [{ stage: 'DEVELOPMENT', enteredAt: day(0), exitedAt: null }],
      now: day(15),
    });

    const breaches = detectOpenBreaches(time);
    expect(breaches.map((b) => b.kind).sort()).toEqual(['LAUNCH_OVERRUN', 'STAGE_OVERRUN']);
  });

  it('does not open a launch breach for a stage with no numeric target (over-target flag stays off)', () => {
    // COMPLETED has no target days - never a stage breach regardless of dwell.
    const time = computeProjectTime({
      startedAt: START,
      stageSegments: [{ stage: 'COMPLETED', enteredAt: day(0), exitedAt: null }],
      now: day(500),
    });
    expect(detectOpenBreaches(time)).toEqual([]);
  });
});

describe('agingBand', () => {
  it('uses the configured thresholds', () => {
    expect(agingBand(10)).toBe('ON_TRACK');
    expect(agingBand(31)).toBe('ATTENTION');
    expect(agingBand(46)).toBe('DELAYED');
    expect(agingBand(90)).toBe('CRITICAL');
  });
});

describe('checkTransition', () => {
  it('refuses to go live without passing through ready for deployment', () => {
    expect(checkTransition('DEVELOPMENT', 'DEPLOYED_LIVE').allowed).toBe(false);
    expect(checkTransition('READY_FOR_DEPLOYMENT', 'DEPLOYED_LIVE').allowed).toBe(true);
  });

  it('refuses to reopen a completed project', () => {
    expect(checkTransition('COMPLETED', 'DEVELOPMENT').allowed).toBe(false);
  });

  it('demands a reason for going backwards and for going on hold', () => {
    expect(checkTransition('DEVELOPMENT', 'DESIGN')).toMatchObject({
      allowed: true,
      requiresReason: true,
    });
    expect(checkTransition('DEVELOPMENT', 'ON_HOLD_BLOCKED')).toMatchObject({
      allowed: true,
      requiresReason: true,
    });
  });

  it('walks the linear track', () => {
    expect(nextLinearStage('INTRODUCTION')).toBe('MERCHANT_CONTACTED');
    expect(nextLinearStage('COMPLETED')).toBe(null);
    expect(nextLinearStage('ON_HOLD_BLOCKED')).toBe(null);
  });
});

describe('assessHealth', () => {
  const time = computeProjectTime({
    startedAt: START,
    stageSegments: [{ stage: 'DEVELOPMENT', enteredAt: day(0), exitedAt: null }],
    lastActivityAt: day(4),
    now: day(5),
  });

  it('is blocked when a blocker is open', () => {
    const verdict = assessHealth({
      stage: 'DEVELOPMENT',
      time,
      openBlockerCount: 1,
      openIssues: [],
      overdueInvoice: false,
    });
    expect(verdict.health).toBe('BLOCKED');
  });

  it('is at risk on an overdue invoice alone', () => {
    const verdict = assessHealth({
      stage: 'DEVELOPMENT',
      time,
      openBlockerCount: 0,
      openIssues: [],
      overdueInvoice: true,
    });
    expect(verdict.health).toBe('AT_RISK');
  });

  it('is on track when nothing is wrong', () => {
    const verdict = assessHealth({
      stage: 'DEVELOPMENT',
      time,
      openBlockerCount: 0,
      openIssues: [{ severity: 'LOW', status: 'OPEN' }],
      overdueInvoice: false,
    });
    expect(verdict.health).toBe('ON_TRACK');
  });
});
