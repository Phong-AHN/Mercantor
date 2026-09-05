import { randomUUID } from 'node:crypto';
import { USER_ROLE_TEAM, type UserRole } from '@relay/core';
import { createSession } from '@relay/auth';
import { db } from '@relay/db';
import type { Principal } from '@relay/rbac';
import { createProjectAction } from '@/features/projects/create';
import { actingAs } from './request-context';

/**
 * Fixture helpers for integration tests. Everything created through this
 * module is tracked so `cleanupFixtures` removes exactly what a test added -
 * never the seeded demo data, never another test file's rows, even though
 * every file shares one database.
 */

// Never verified - integration tests mint sessions directly and never sign in
// through a password, so the hash only has to satisfy the NOT NULL column.
const UNUSED_PASSWORD_HASH = 'scrypt$1$1$1$dW51c2Vk$dW51c2Vk';

/**
 * Deliberately typed as `Principal`, not a lookalike. `readableVisibilities`
 * and `can()` both read `isActive` and derive team from `role` - a fixture
 * missing either field does not fail loudly, it just silently narrows what
 * the "principal" can see, which is exactly the kind of bug these tests
 * exist to catch. Matching the real type at compile time closes that gap.
 */
export type TestUser = Principal;

const createdUserIds: string[] = [];
const createdMerchantIds: string[] = [];
const createdProjectIds: string[] = [];

export async function createTestUser(
  role: UserRole,
  overrides: Partial<{ name: string }> = {},
): Promise<TestUser> {
  const suffix = randomUUID().slice(0, 8);
  const user = await db.user.create({
    data: {
      email: `it-${suffix}@relay.test`,
      name: overrides.name ?? `Test ${role} ${suffix}`,
      passwordHash: UNUSED_PASSWORD_HASH,
      role,
      team: USER_ROLE_TEAM[role],
      isActive: true,
    },
    select: { id: true, email: true, name: true, role: true, team: true, isActive: true },
  });
  createdUserIds.push(user.id);
  return user;
}

/** Mints a real, hashed session row and points the mocked request at it. */
export async function signInAs(user: TestUser): Promise<void> {
  const session = await createSession(user.id, {});
  actingAs(session.token);
}

export async function signOut(): Promise<void> {
  actingAs(undefined);
}

/**
 * Builds a project the same way the UI does - through `createProjectAction` -
 * so the seeded access/asset/scope checklists and the NOT_REQUESTED approval
 * rows are exactly what a real "New project" click produces.
 */
export async function createTestProject(input: {
  as: TestUser;
  merchantName?: string;
  ahnProjectManagerId?: string;
  ahnDeveloperId?: string;
  shoplineAmId?: string;
  shoplineSeId?: string;
}): Promise<{ id: string; code: string }> {
  await signInAs(input.as);
  const suffix = randomUUID().slice(0, 8);

  const result = await createProjectAction({
    merchantName: input.merchantName ?? `IT Merchant ${suffix}`,
    contactName: 'Test Contact',
    contactEmail: `owner-${suffix}@relay.test`,
    ahnProjectManagerId: input.ahnProjectManagerId,
    ahnDeveloperId: input.ahnDeveloperId,
    shoplineAmId: input.shoplineAmId,
    shoplineSeId: input.shoplineSeId,
  });
  if (!result.ok) {
    throw new Error(`fixture: createProjectAction failed - ${result.error}`);
  }

  const project = await db.project.findUniqueOrThrow({
    where: { code: result.data.code },
    select: { id: true, code: true, merchantId: true },
  });
  createdProjectIds.push(project.id);
  createdMerchantIds.push(project.merchantId);
  return { id: project.id, code: project.code };
}

/**
 * Removes everything this module created, in FK-safe order: projects first
 * (cascades every child row - blockers, comments, invoices, the outbox...),
 * then merchants (now unreferenced), then users (cascades their sessions).
 * `Project.merchant` is a required relation with no cascade, so the order
 * matters - deleting a merchant first is a foreign-key violation on purpose,
 * it is the same guard that stops the app orphaning a project.
 */
export async function cleanupFixtures(): Promise<void> {
  if (createdProjectIds.length > 0) {
    await db.project.deleteMany({ where: { id: { in: createdProjectIds } } });
    createdProjectIds.length = 0;
  }
  if (createdMerchantIds.length > 0) {
    await db.merchant.deleteMany({ where: { id: { in: createdMerchantIds } } });
    createdMerchantIds.length = 0;
  }
  if (createdUserIds.length > 0) {
    await db.user.deleteMany({ where: { id: { in: createdUserIds } } });
    createdUserIds.length = 0;
  }
}
