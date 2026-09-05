import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '@relay/db';
import {
  cleanupFixtures,
  createTestProject,
  createTestUser,
  signInAs,
  type TestUser,
} from '../../../test/fixtures';
import { approveChangeRequestAction, updateScopeItemAction } from './actions';

/**
 * Pricing and approving a change request through the real actions:
 * `invoice:manage` is required to approve (a commercial decision, not a
 * scope one - D-012's distinction), an unpriced or already-approved request
 * cannot be approved twice, and approval creates exactly one invoice line,
 * atomically with the approval itself.
 */
describe('change request approval', () => {
  let pm: TestUser;
  let dev: TestUser;
  let projectCode: string;
  let projectId: string;
  let itemId: string;

  beforeAll(async () => {
    pm = await createTestUser('AHN_PROJECT_MANAGER');
    dev = await createTestUser('AHN_DEVELOPER');

    const project = await createTestProject({
      as: pm,
      ahnProjectManagerId: pm.id,
      ahnDeveloperId: dev.id,
    });
    projectCode = project.code;
    projectId = project.id;

    const item = await db.scopeItem.findFirstOrThrow({
      where: { projectId: project.id },
      select: { id: true },
    });
    itemId = item.id;

    await signInAs(pm);
    const priced = await updateScopeItemAction({
      code: projectCode,
      itemId,
      disposition: 'CHANGE_REQUEST',
      changeRequestAmountMinor: 150_000,
    });
    expect(priced.ok).toBe(true);
  });

  afterAll(async () => {
    await cleanupFixtures();
  });

  it('a developer (no invoice:manage) cannot approve it', async () => {
    await signInAs(dev);
    const result = await approveChangeRequestAction({ code: projectCode, itemId });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.code).toBe('FORBIDDEN');
  });

  it('approving creates exactly one invoice line, linked back to the scope item', async () => {
    await signInAs(pm);
    const result = await approveChangeRequestAction({ code: projectCode, itemId });
    expect(result.ok).toBe(true);

    const item = await db.scopeItem.findUniqueOrThrow({
      where: { id: itemId },
      select: { changeRequestApprovedAt: true },
    });
    expect(item.changeRequestApprovedAt).not.toBeNull();

    const invoices = await db.invoice.findMany({ where: { scopeItemId: itemId } });
    expect(invoices).toHaveLength(1);
    expect(invoices[0]?.amountMinor).toBe(150_000);
    expect(invoices[0]?.status).toBe('NOT_INVOICED');
    expect(invoices[0]?.projectId).toBe(projectId);
  });

  it('cannot be approved a second time', async () => {
    const result = await approveChangeRequestAction({ code: projectCode, itemId });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.code).toBe('CONFLICT');

    // Still exactly one invoice line - a repeat approval never doubles it.
    const invoices = await db.invoice.findMany({ where: { scopeItemId: itemId } });
    expect(invoices).toHaveLength(1);
  });

  it('an unpriced change request cannot be approved', async () => {
    const item = await db.scopeItem.findFirstOrThrow({
      where: { projectId, disposition: 'IN_SCOPE' },
      select: { id: true },
    });
    const flipped = await updateScopeItemAction({
      code: projectCode,
      itemId: item.id,
      disposition: 'CHANGE_REQUEST',
    });
    expect(flipped.ok).toBe(true);

    const result = await approveChangeRequestAction({ code: projectCode, itemId: item.id });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.code).toBe('VALIDATION_FAILED');
  });
});
