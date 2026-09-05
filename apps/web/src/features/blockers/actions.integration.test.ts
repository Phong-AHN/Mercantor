import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '@relay/db';
import {
  cleanupFixtures,
  createTestProject,
  createTestUser,
  signInAs,
  type TestUser,
} from '../../../test/fixtures';
import { openBlockerAction, reassignBlockerAction, resolveBlockerAction } from './actions';

/**
 * The blocker-handover arithmetic through the real entry points: opening a
 * blocker starts an ownership span, reassigning it closes one span and opens
 * the next at the same instant, and the partial unique index never leaves two
 * spans open. This is the guarantee `computeProjectTime` depends on -
 * `sla.test.ts` proves the maths in isolation, this proves the actions that
 * feed it write the rows correctly.
 */
describe('blocker handover', () => {
  let pm: TestUser;
  let dev: TestUser;
  let am: TestUser;
  let merchant: TestUser;
  let projectCode: string;
  let projectId: string;

  beforeAll(async () => {
    pm = await createTestUser('AHN_PROJECT_MANAGER');
    dev = await createTestUser('AHN_DEVELOPER');
    am = await createTestUser('SHOPLINE_ACCOUNT_MANAGER');
    merchant = await createTestUser('MERCHANT');

    const project = await createTestProject({
      as: pm,
      ahnProjectManagerId: pm.id,
      ahnDeveloperId: dev.id,
      shoplineAmId: am.id,
    });
    projectCode = project.code;
    projectId = project.id;
  });

  afterAll(async () => {
    await cleanupFixtures();
  });

  it('refuses a merchant, who has no blocker:manage permission', async () => {
    await signInAs(merchant);
    const result = await openBlockerAction({
      code: projectCode,
      category: 'WAITING_ON_MERCHANT',
      title: 'Should never be created',
      nextAction: 'n/a',
      ownerTeam: 'MERCHANT',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('FORBIDDEN');

    const count = await db.blocker.count({ where: { projectId } });
    expect(count).toBe(0);
  });

  it('opens a blocker, marks the project health BLOCKED, and starts one ownership span', async () => {
    await signInAs(pm);
    const result = await openBlockerAction({
      code: projectCode,
      category: 'WAITING_ON_AHN',
      title: 'Waiting on the AHN build',
      nextAction: 'Finish the theme.',
      ownerTeam: 'AHN',
      ownerUserId: dev.id,
    });
    expect(result.ok).toBe(true);

    const blocker = await db.blocker.findFirstOrThrow({
      where: { projectId, resolvedAt: null },
    });
    expect(blocker.ownerTeam).toBe('AHN');
    expect(blocker.ownerUserId).toBe(dev.id);

    const openSpans = await db.blockerOwnership.findMany({
      where: { blockerId: blocker.id, endedAt: null },
    });
    expect(openSpans).toHaveLength(1);
    expect(openSpans[0]?.ownerTeam).toBe('AHN');

    const project = await db.project.findUniqueOrThrow({ where: { id: projectId } });
    expect(project.health).toBe('BLOCKED');
    expect(project.currentBlockerId).toBe(blocker.id);
  });

  it('handing over closes the previous span and opens exactly one new one', async () => {
    const blocker = await db.blocker.findFirstOrThrow({ where: { projectId, resolvedAt: null } });

    const result = await reassignBlockerAction({
      code: projectCode,
      blockerId: blocker.id,
      ownerTeam: 'MERCHANT',
      note: 'Handed to the merchant for a decision.',
    });
    expect(result.ok).toBe(true);

    const spans = await db.blockerOwnership.findMany({
      where: { blockerId: blocker.id },
      orderBy: { startedAt: 'asc' },
    });
    expect(spans).toHaveLength(2);

    // The AHN span closed with a real, non-negative duration...
    expect(spans[0]?.ownerTeam).toBe('AHN');
    expect(spans[0]?.endedAt).not.toBeNull();
    expect(spans[0]?.durationMs).not.toBeNull();
    expect(Number(spans[0]?.durationMs ?? -1)).toBeGreaterThanOrEqual(0);

    // ...at the exact instant the merchant span opened. No gap, no overlap.
    expect(spans[0]?.endedAt?.getTime()).toBe(spans[1]?.startedAt.getTime());

    // Exactly one span is open - the partial unique index's guarantee, made visible.
    expect(spans[1]?.endedAt).toBeNull();
    expect(spans[1]?.ownerTeam).toBe('MERCHANT');

    const updated = await db.blocker.findUniqueOrThrow({ where: { id: blocker.id } });
    expect(updated.ownerTeam).toBe('MERCHANT');
  });

  it('refuses reassigning to the team that already holds it', async () => {
    const blocker = await db.blocker.findFirstOrThrow({ where: { projectId, resolvedAt: null } });
    const result = await reassignBlockerAction({
      code: projectCode,
      blockerId: blocker.id,
      ownerTeam: 'MERCHANT',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('CONFLICT');

    // Refused, so the span count from the previous test must be unchanged.
    const openSpans = await db.blockerOwnership.count({
      where: { blockerId: blocker.id, endedAt: null },
    });
    expect(openSpans).toBe(1);
  });

  it('resolving closes the last open span and returns the project to ON_TRACK', async () => {
    const blocker = await db.blocker.findFirstOrThrow({ where: { projectId, resolvedAt: null } });

    const result = await resolveBlockerAction({
      code: projectCode,
      blockerId: blocker.id,
      resolution: 'Merchant made the call; development resumed.',
    });
    expect(result.ok).toBe(true);

    const spans = await db.blockerOwnership.findMany({ where: { blockerId: blocker.id } });
    expect(spans.every((span) => span.endedAt !== null)).toBe(true);

    const resolved = await db.blocker.findUniqueOrThrow({ where: { id: blocker.id } });
    expect(resolved.resolvedAt).not.toBeNull();
    expect(resolved.resolution).toContain('Merchant made the call');

    const project = await db.project.findUniqueOrThrow({ where: { id: projectId } });
    expect(project.health).toBe('ON_TRACK');
    expect(project.currentBlockerId).toBeNull();
  });
});
