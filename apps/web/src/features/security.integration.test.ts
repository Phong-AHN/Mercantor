import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '@relay/db';
import {
  cleanupFixtures,
  createTestOrganization,
  createTestProject,
  createTestUser,
  signInAs,
  signOut,
  type TestUser,
} from '../../test/fixtures';
import { requestPasswordResetAction } from './account/actions';
import { postCommentAction } from './activity/actions';
import { confirmUploadAction } from './attachments/actions';
import { attachLinkAction } from './checklists/actions';
import { updateMerchantAction } from './projects/actions';
import { createProjectAction } from './projects/create';

/**
 * Regression tests for the October 2026 security pass. Each one is a way
 * the app could be pointed at data or behaviour it should refuse.
 */

describe('attachments stay on their own project', () => {
  let pm: TestUser;
  let otherPm: TestUser;
  let merchant: TestUser;
  let projectCode: string;
  let projectId: string;
  let otherIssueId: string;
  let otherAssetItemId: string;
  let internalCommentId: string;

  beforeAll(async () => {
    pm = await createTestUser('AHN_PROJECT_MANAGER');
    merchant = await createTestUser('MERCHANT');
    const project = await createTestProject({ as: pm, ahnProjectManagerId: pm.id });
    projectCode = project.code;
    projectId = project.id;
    await db.projectMember.create({ data: { projectId, userId: merchant.id } });

    // A second tenant entirely, with records whose ids an attacker may know.
    const otherOrg = await createTestOrganization();
    otherPm = await createTestUser('AHN_PROJECT_MANAGER', { organizationId: otherOrg.id });
    const other = await createTestProject({ as: otherPm, ahnProjectManagerId: otherPm.id });
    const otherProject = await db.project.findUniqueOrThrow({
      where: { id: other.id },
      select: { assetItems: { select: { id: true }, take: 1 } },
    });
    otherAssetItemId = otherProject.assetItems[0]!.id;
    otherIssueId = (
      await db.issue.create({
        data: {
          projectId: other.id,
          reference: `ISS-SEC-${Date.now()}`,
          title: 'Other tenant issue',
          description: 'Belongs to the other organization.',
          severity: 'LOW',
          reportedById: otherPm.id,
        },
        select: { id: true },
      })
    ).id;

    await signInAs(pm);
    const posted = await postCommentAction({
      code: projectCode,
      body: 'AHN internal note',
      visibility: 'INTERNAL_AHN',
    });
    if (!posted.ok) throw new Error(posted.error);
    internalCommentId = posted.data.id;
  });

  afterAll(async () => {
    await cleanupFixtures();
  });

  it("refuses a link attached to another organization's issue", async () => {
    await signInAs(pm);
    const result = await attachLinkAction({
      code: projectCode,
      label: 'Injected',
      url: 'https://example.com/file',
      issueId: otherIssueId,
    });
    expect(result.ok).toBe(false);
    expect(await db.attachment.count({ where: { issueId: otherIssueId } })).toBe(0);
  });

  it("refuses a link attached to another project's asset item", async () => {
    await signInAs(pm);
    const result = await attachLinkAction({
      code: projectCode,
      label: 'Injected',
      url: 'https://example.com/file',
      assetItemId: otherAssetItemId,
    });
    expect(result.ok).toBe(false);
  });

  it('refuses a file confirmed against another project item before touching storage', async () => {
    await signInAs(pm);
    const result = await confirmUploadAction({
      code: projectCode,
      key: `project/${projectId}/2026/10/does-not-exist.png`,
      label: 'x.png',
      contentType: 'image/png',
      issueId: otherIssueId,
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    // Refused for the right reason - not merely because the object is missing.
    expect(result.error).toMatch(/does not belong/);
  });

  it('refuses a merchant attaching to an AHN-internal comment', async () => {
    await signInAs(merchant);
    const result = await attachLinkAction({
      code: projectCode,
      label: 'Injected',
      url: 'https://example.com/file',
    });
    // A plain link on their own project is fine...
    expect(result.ok).toBe(true);
    // ...a file onto the internal note is not.
    const onInternal = await confirmUploadAction({
      code: projectCode,
      key: `project/${projectId}/2026/10/does-not-exist.png`,
      label: 'x.png',
      contentType: 'image/png',
      commentId: internalCommentId,
    });
    expect(onInternal.ok).toBe(false);
    if (onInternal.ok) throw new Error('unreachable');
    expect(onInternal.error).toMatch(/comment/i);
  });

  it('refuses link URLs that are not web links', async () => {
    await signInAs(pm);
    for (const url of ['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>']) {
      const result = await attachLinkAction({ code: projectCode, label: 'Bad', url });
      expect(result.ok, url).toBe(false);
    }
  });
});

describe('merchant websites are web links', () => {
  let pm: TestUser;

  beforeAll(async () => {
    pm = await createTestUser('AHN_PROJECT_MANAGER');
  });

  afterAll(async () => {
    await cleanupFixtures();
  });

  it('refuses a javascript: website on create and on edit', async () => {
    await signInAs(pm);
    const created = await createProjectAction({
      merchantName: 'Script Merchant',
      website: 'javascript:alert(document.cookie)',
      contactName: 'Test Contact',
      contactEmail: `script-${Date.now()}@relay.test`,
    });
    expect(created.ok).toBe(false);
    if (created.ok) throw new Error('unreachable');
    expect(created.fieldErrors?.website).toBeTruthy();

    const project = await createTestProject({ as: pm, ahnProjectManagerId: pm.id });
    const edited = await updateMerchantAction({
      code: project.code,
      name: 'Script Merchant',
      website: 'javascript:alert(document.cookie)',
      contact: { name: 'Test Contact', email: 'owner@relay.test' },
    });
    expect(edited.ok).toBe(false);
    if (edited.ok) throw new Error('unreachable');
    expect(edited.fieldErrors?.website).toBeTruthy();
  });
});

describe('password reset requests are capped per account', () => {
  afterAll(async () => {
    await cleanupFixtures();
  });

  it('issues at most three reset links an hour, and says the same thing every time', async () => {
    await signOut();
    const user = await createTestUser('AHN_PROJECT_MANAGER');
    const form = new FormData();
    form.append('email', user.email);

    const messages = new Set<string | undefined>();
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const result = await requestPasswordResetAction(null, form);
      expect(result.ok).toBe(true);
      if (result.ok) messages.add(result.message);
    }

    expect(messages.size).toBe(1);
    expect(await db.passwordToken.count({ where: { userId: user.id, purpose: 'RESET' } })).toBe(3);
  });
});
