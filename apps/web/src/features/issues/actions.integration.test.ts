import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '@relay/db';
import {
  cleanupFixtures,
  createTestProject,
  createTestUser,
  signInAs,
  type TestUser,
} from '../../../test/fixtures';
import { createClickUpTaskAction, createIssueAction } from './actions';

/**
 * D-027 / D-039: four notification types are urgent enough to also reach
 * someone through email and a Slack DM, through the same outbox Slack and
 * ClickUp already use. This proves both halves - a launch blocker (urgent)
 * queues one email and one `notification_dm` per recipient, and an ordinary
 * issue (not urgent) queues neither, so the allowlist is doing real work
 * rather than reaching everyone about everything.
 */
describe('urgent notification delivery', () => {
  let pm: TestUser;
  let dev: TestUser;
  let am: TestUser;
  let se: TestUser;
  let projectCode: string;
  let projectId: string;

  beforeAll(async () => {
    pm = await createTestUser('AHN_PROJECT_MANAGER');
    dev = await createTestUser('AHN_DEVELOPER');
    am = await createTestUser('SHOPLINE_ACCOUNT_MANAGER');
    se = await createTestUser('SHOPLINE_SOLUTIONS_ENGINEER');

    const project = await createTestProject({
      as: pm,
      ahnProjectManagerId: pm.id,
      ahnDeveloperId: dev.id,
      shoplineAmId: am.id,
      shoplineSeId: se.id,
    });
    projectCode = project.code;
    projectId = project.id;
  });

  afterAll(async () => {
    await cleanupFixtures();
  });

  it('a launch blocker queues one email per recipient, and never one to the reporter', async () => {
    await signInAs(pm);
    const result = await createIssueAction({
      code: projectCode,
      title: 'Checkout throws a 500 on the live theme',
      description: 'Every checkout attempt fails after the last deploy.',
      severity: 'LAUNCH_BLOCKER',
      ownerTeam: 'AHN',
    });
    expect(result.ok).toBe(true);

    // pm reported it and is excluded; am, se and dev all watch a launch blocker.
    const notifications = await db.notification.findMany({
      where: { projectId, type: 'LAUNCH_BLOCKER' },
      select: { userId: true, title: true },
    });
    expect(notifications).toHaveLength(3);
    expect(new Set(notifications.map((n) => n.userId))).toEqual(new Set([am.id, se.id, dev.id]));
    expect(notifications.every((n) => n.userId !== pm.id)).toBe(true);

    const emails = await db.outboxMessage.findMany({
      where: { projectId, provider: 'EMAIL' },
      select: { payload: true, status: true },
    });
    expect(emails).toHaveLength(3);
    expect(emails.every((row) => row.status === 'PENDING')).toBe(true);

    const recipientEmails = emails.map((row) => {
      const payload = row.payload as { to: { email: string }[]; subject: string; html: string };
      expect(payload.to).toHaveLength(1);
      expect(payload.subject).toContain('Launch Blocker issue on');
      // The rendered HTML must not carry the raw title unescaped in a way that
      // breaks on a merchant name with special characters - a light sanity
      // check that `renderNotificationEmail` actually ran, not a stub.
      expect(payload.html).toContain('Open in the portal');
      return payload.to[0]?.email;
    });
    expect(new Set(recipientEmails)).toEqual(new Set([am.email, se.email, dev.email]));

    // The same three recipients, once each, as a Slack DM row too.
    const dms = await db.outboxMessage.findMany({
      where: { projectId, provider: 'SLACK', kind: 'notification_dm' },
      select: { payload: true, status: true },
    });
    expect(dms).toHaveLength(3);
    expect(dms.every((row) => row.status === 'PENDING')).toBe(true);
    const dmEmails = dms.map((row) => (row.payload as { email: string }).email);
    expect(new Set(dmEmails)).toEqual(new Set([am.email, se.email, dev.email]));
  });

  it('an ordinary issue is not urgent and queues neither an email nor a Slack DM', async () => {
    await signInAs(dev);
    const before = await db.outboxMessage.count({
      where: { projectId, provider: { in: ['EMAIL', 'SLACK'] } },
    });

    const result = await createIssueAction({
      code: projectCode,
      title: 'A typo in the footer copyright year',
      description: 'Says 2024, should say the current year.',
      severity: 'LOW',
      ownerTeam: 'AHN',
    });
    expect(result.ok).toBe(true);

    const after = await db.outboxMessage.count({
      where: { projectId, provider: { in: ['EMAIL', 'SLACK'] } },
    });
    expect(after).toBe(before);
  });
});

/**
 * Task creation reuses the project's existing ClickUp link rather than a
 * separate "which list" setting: it reads the linked task's list (through
 * the mock adapter here - no `CLICKUP_API_TOKEN` in the test environment,
 * same as every other provider call in this suite) and creates the new task
 * as a subtask of it.
 */
describe('creating a ClickUp task from an issue', () => {
  let pm: TestUser;
  let dev: TestUser;
  let merchant: TestUser;
  let projectCode: string;
  let projectId: string;
  let issueId: string;

  beforeAll(async () => {
    pm = await createTestUser('AHN_PROJECT_MANAGER');
    dev = await createTestUser('AHN_DEVELOPER');
    merchant = await createTestUser('MERCHANT');

    const project = await createTestProject({ as: pm, ahnProjectManagerId: pm.id });
    projectCode = project.code;
    projectId = project.id;
    await db.projectMember.create({ data: { projectId, userId: merchant.id } });

    await signInAs(pm);
    const issue = await createIssueAction({
      code: projectCode,
      title: 'Redirect map is missing legacy category pages',
      description: 'The old /collections/ URLs 404 instead of redirecting.',
      severity: 'HIGH',
      ownerTeam: 'AHN',
    });
    expect(issue.ok).toBe(true);
    const row = await db.issue.findFirstOrThrow({ where: { projectId }, select: { id: true } });
    issueId = row.id;
  });

  afterAll(async () => {
    await cleanupFixtures();
  });

  it('is refused when the project has no ClickUp task linked', async () => {
    const result = await createClickUpTaskAction({ code: projectCode, issueId });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.code).toBe('CONFLICT');
  });

  it('a merchant (no issue:manage) cannot create one', async () => {
    await db.integrationLink.create({
      data: {
        projectId,
        provider: 'CLICKUP',
        externalId: 'parent-task-1',
        externalUrl: 'https://app.clickup.com/t/parent-task-1',
      },
    });

    await signInAs(merchant);
    const result = await createClickUpTaskAction({ code: projectCode, issueId });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.code).toBe('FORBIDDEN');
  });

  it('creates a task nested under the project’s linked task, and records it on the issue', async () => {
    await signInAs(dev);
    const result = await createClickUpTaskAction({ code: projectCode, issueId });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.data.url).toMatch(/^https:\/\/app\.clickup\.com\/t\//);

    const issue = await db.issue.findUniqueOrThrow({
      where: { id: issueId },
      select: { clickUpTaskId: true, clickUpTaskUrl: true },
    });
    expect(issue.clickUpTaskId).toBeTruthy();
    expect(issue.clickUpTaskUrl).toBe(result.data.url);
  });

  it('cannot be created a second time', async () => {
    const result = await createClickUpTaskAction({ code: projectCode, issueId });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.code).toBe('CONFLICT');
  });
});
