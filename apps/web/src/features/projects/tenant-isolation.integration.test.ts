import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '@relay/db';
import { integrationsFor, setOrganizationIntegration } from '@relay/integrations';
import {
  cleanupFixtures,
  createTestOrganization,
  createTestProject,
  createTestUser,
  signInAs,
  type TestUser,
} from '../../../test/fixtures';
import { createProjectAction, searchMerchantsAction } from './create';
import { listAssignableUsers, listProjects } from './queries';

/**
 * D-052: every company that signs up is its own `Organization`, not a
 * sub-view of one hardcoded "AHN". This proves the seam actually holds -
 * organization B never appears in anything organization A's principal reads,
 * assigns, searches, or resolves credentials against - the same property
 * `packages/rbac/src/engine.test.ts` proves at the unit level for
 * `projectScopeWhere` alone, exercised here through the real actions and a
 * real database.
 */
describe('tenant isolation between organizations', () => {
  let orgAPm: TestUser;
  let orgBPm: TestUser;
  let orgAProjectCode: string;
  let orgBProjectCode: string;

  beforeAll(async () => {
    orgAPm = await createTestUser('AHN_PROJECT_MANAGER');

    const orgB = await createTestOrganization();
    orgBPm = await createTestUser('AHN_PROJECT_MANAGER', { organizationId: orgB.id });

    const projectA = await createTestProject({ as: orgAPm, ahnProjectManagerId: orgAPm.id });
    orgAProjectCode = projectA.code;

    const projectB = await createTestProject({ as: orgBPm, ahnProjectManagerId: orgBPm.id });
    orgBProjectCode = projectB.code;
  });

  afterAll(async () => {
    await cleanupFixtures();
  });

  it("a project list never includes another organization's projects", async () => {
    const codesForA = (await listProjects(orgAPm)).map((p) => p.code);
    expect(codesForA).toContain(orgAProjectCode);
    expect(codesForA).not.toContain(orgBProjectCode);

    const codesForB = (await listProjects(orgBPm)).map((p) => p.code);
    expect(codesForB).toContain(orgBProjectCode);
    expect(codesForB).not.toContain(orgAProjectCode);
  });

  it("cannot search up another organization's merchant by name", async () => {
    await signInAs(orgAPm);
    // The merchant `createTestProject` creates is named `IT Merchant <suffix>`
    // and unique per call, so searching for org B's own project code (which
    // shares no substring with org A's merchant name) proves nothing rather
    // than searching for the real name - fetch it for real instead.
    const orgBProject = (await listProjects(orgBPm)).find((p) => p.code === orgBProjectCode)!;
    const orgBQuery = orgBProject.merchant.name.slice(0, 8);

    const result = await searchMerchantsAction({ q: orgBQuery });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.data.map((m) => m.name)).not.toContain(orgBProject.merchant.name);
  });

  it("cannot list, and therefore cannot assign, another organization's staff", async () => {
    const assignableForA = await listAssignableUsers(orgAPm.organizationId);
    expect(assignableForA.all.map((u) => u.id)).toContain(orgAPm.id);
    expect(assignableForA.all.map((u) => u.id)).not.toContain(orgBPm.id);
  });

  it('a platform admin (no organization of its own) sees every organization', async () => {
    const admin = await createTestUser('PLATFORM_ADMIN');
    const codes = (await listProjects(admin)).map((p) => p.code);
    expect(codes).toContain(orgAProjectCode);
    expect(codes).toContain(orgBProjectCode);
  });

  it('a platform admin cannot create a project - it has no organization to put one in', async () => {
    const admin = await createTestUser('PLATFORM_ADMIN');
    await signInAs(admin);
    const result = await createProjectAction({
      merchantName: 'Should Not Be Created',
      contactName: 'Nobody',
      contactEmail: 'nobody@example.com',
    });
    expect(result.ok).toBe(false);
  });

  it("configuring organization A's Slack credentials never leaks into organization B's provider resolution", async () => {
    // Written straight through `setOrganizationIntegration` (the registry's
    // own encrypt-and-upsert) rather than the `configure` action, which
    // verifies a token against the real Slack API before saving - out of
    // place in a suite that otherwise never leaves the local database.
    await setOrganizationIntegration({
      organizationId: orgAPm.organizationId!,
      provider: 'SLACK',
      config: { botToken: 'xoxb-test-token-for-isolation-only' },
      configuredById: orgAPm.id,
    });

    try {
      // Org A now has its own encrypted row - org B's has never been touched.
      const rowA = await db.organizationIntegration.findUnique({
        where: {
          organizationId_provider: { organizationId: orgAPm.organizationId!, provider: 'SLACK' },
        },
      });
      expect(rowA).not.toBeNull();
      expect(rowA?.encryptedConfig).not.toContain('xoxb-test-token-for-isolation-only');

      const rowB = await db.organizationIntegration.findUnique({
        where: {
          organizationId_provider: { organizationId: orgBPm.organizationId!, provider: 'SLACK' },
        },
      });
      expect(rowB).toBeNull();

      // With nothing configured, org B still resolves to the mock adapter -
      // never to org A's token, regardless of which organization asked first.
      const healthB = await (await integrationsFor(orgBPm.organizationId)).slack.health();
      expect(healthB.mode).toBe('mock');
    } finally {
      await setOrganizationIntegration({
        organizationId: orgAPm.organizationId!,
        provider: 'SLACK',
        config: null,
        configuredById: orgAPm.id,
      });
    }
  });
});
