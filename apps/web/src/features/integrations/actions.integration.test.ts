import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '@relay/db';
import {
  cleanupFixtures,
  createTestProject,
  createTestUser,
  signInAs,
  type TestUser,
} from '../../../test/fixtures';
import { linkClickUpTaskAction, linkSlackChannelAction, unlinkIntegrationAction } from './actions';

/**
 * D-045: before this, a project's Slack channel and ClickUp task could only
 * be connected by `pnpm db:seed` or a direct database write - the
 * `/integrations` page only ever showed provider health and the outbox, and
 * a project's own Settings page just displayed whatever was already there.
 * No `CLICKUP_API_TOKEN` or `SLACK_BOT_TOKEN` is set in the test
 * environment, so every call here goes through the mock adapter - the same
 * arrangement `createClickUpTaskAction`'s tests already rely on.
 */
describe('linking a project to ClickUp', () => {
  let pm: TestUser;
  let merchant: TestUser;
  let projectCode: string;
  let projectId: string;

  beforeAll(async () => {
    pm = await createTestUser('AHN_PROJECT_MANAGER');
    merchant = await createTestUser('MERCHANT');
    const project = await createTestProject({ as: pm, ahnProjectManagerId: pm.id });
    projectCode = project.code;
    projectId = project.id;
    await db.projectMember.create({ data: { projectId, userId: merchant.id } });
  });

  afterAll(async () => {
    await cleanupFixtures();
  });

  it('a merchant (no project:update) cannot link one', async () => {
    await signInAs(merchant);
    const result = await linkClickUpTaskAction({ code: projectCode, task: 'task-1' });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.code).toBe('FORBIDDEN');
  });

  it('links by a bare task id, verified live through getTask first', async () => {
    await signInAs(pm);
    const result = await linkClickUpTaskAction({ code: projectCode, task: 'task-42' });
    expect(result.ok).toBe(true);

    const link = await db.integrationLink.findUniqueOrThrow({
      where: { projectId_provider: { projectId, provider: 'CLICKUP' } },
    });
    expect(link.externalId).toBe('task-42');
    expect(link.externalUrl).toBe('https://app.clickup.com/t/task-42');
    expect(link.isActive).toBe(true);
  });

  it('accepts a full task URL and stores only the id, not the whole link', async () => {
    const result = await linkClickUpTaskAction({
      code: projectCode,
      task: 'https://app.clickup.com/t/task-99?view=abc',
    });
    expect(result.ok).toBe(true);

    // Same provider - relinking replaces the one row rather than duplicating it.
    const links = await db.integrationLink.findMany({
      where: { projectId, provider: 'CLICKUP' },
    });
    expect(links).toHaveLength(1);
    expect(links[0]?.externalId).toBe('task-99');
  });

  it('accepts a team-prefixed task URL', async () => {
    const result = await linkClickUpTaskAction({
      code: projectCode,
      task: 'https://app.clickup.com/t/2375486/task-100',
    });
    expect(result.ok).toBe(true);

    const link = await db.integrationLink.findUniqueOrThrow({
      where: { projectId_provider: { projectId, provider: 'CLICKUP' } },
    });
    expect(link.externalId).toBe('task-100');
  });

  it('unlinks cleanly, and unlinking again is refused', async () => {
    const result = await unlinkIntegrationAction({ code: projectCode, provider: 'CLICKUP' });
    expect(result.ok).toBe(true);

    const link = await db.integrationLink.findUnique({
      where: { projectId_provider: { projectId, provider: 'CLICKUP' } },
    });
    expect(link).toBeNull();

    const again = await unlinkIntegrationAction({ code: projectCode, provider: 'CLICKUP' });
    expect(again.ok).toBe(false);
    if (again.ok) throw new Error('unreachable');
    expect(again.code).toBe('CONFLICT');
  });
});

describe('linking a project to Slack', () => {
  let pm: TestUser;
  let projectCode: string;
  let projectId: string;

  beforeAll(async () => {
    pm = await createTestUser('AHN_PROJECT_MANAGER');
    const project = await createTestProject({ as: pm, ahnProjectManagerId: pm.id });
    projectCode = project.code;
    projectId = project.id;
    await signInAs(pm);
  });

  afterAll(async () => {
    await cleanupFixtures();
  });

  it('refuses a channel id that is not in the live list', async () => {
    const result = await linkSlackChannelAction({ code: projectCode, channelId: 'C-MADE-UP' });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.code).toBe('CONFLICT');
  });

  it('links a channel chosen from the live list, by id not by whatever the client sends for its name', async () => {
    const result = await linkSlackChannelAction({
      code: projectCode,
      channelId: 'C-SHOPLINE-MIGRATIONS',
    });
    expect(result.ok).toBe(true);

    const link = await db.integrationLink.findUniqueOrThrow({
      where: { projectId_provider: { projectId, provider: 'SLACK' } },
    });
    expect(link.externalId).toBe('C-SHOPLINE-MIGRATIONS');
    expect(link.displayName).toBe('#shopline-migrations');
    expect(link.externalUrl).toContain('C-SHOPLINE-MIGRATIONS');
  });

  it('relinking to a different channel replaces the link rather than adding a second row', async () => {
    await linkSlackChannelAction({ code: projectCode, channelId: 'C-AHN-DELIVERY' });

    const links = await db.integrationLink.findMany({ where: { projectId, provider: 'SLACK' } });
    expect(links).toHaveLength(1);
    expect(links[0]?.externalId).toBe('C-AHN-DELIVERY');
  });
});
