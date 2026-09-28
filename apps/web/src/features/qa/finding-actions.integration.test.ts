import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '@relay/db';
import { requirePrincipal } from '@/server/session';
import {
  cleanupFixtures,
  createTestProject,
  createTestUser,
  signInAs,
  type TestUser,
} from '../../../test/fixtures';
import { addPagesAction, saveStorefrontProfileAction } from './actions';
import {
  commentOnFindingAction,
  createFindingAction,
  markFalsePositiveAction,
  setFindingVisibilityAction,
  updateFindingAction,
} from './finding-actions';
import { getFinding, listFindings } from './queries';

describe('site QA findings', () => {
  let pm: TestUser;
  let dev: TestUser;
  let am: TestUser;
  let merchant: TestUser;
  let code: string;
  let projectId: string;

  beforeAll(async () => {
    pm = await createTestUser('AHN_PROJECT_MANAGER');
    dev = await createTestUser('AHN_DEVELOPER');
    am = await createTestUser('SHOPLINE_ACCOUNT_MANAGER');
    merchant = await createTestUser('MERCHANT');
    const project = await createTestProject({ as: pm, ahnProjectManagerId: pm.id });
    code = project.code;
    projectId = project.id;
    await db.projectMember.create({ data: { projectId, userId: merchant.id } });

    await signInAs(pm);
    const saved = await saveStorefrontProfileAction({
      code,
      storefrontUrl: 'https://shop.qa-test.example',
      destinationUrl: 'https://qa-test.myshopline.com',
      sourcePlatform: 'SHOPIFY',
      destinationPlatform: 'SHOPLINE',
      build: 'STANDARD_THEME',
    });
    expect(saved.ok).toBe(true);
  });

  afterAll(async () => {
    await cleanupFixtures();
  });

  async function logFinding(title: string) {
    await signInAs(pm);
    const result = await createFindingAction({
      code,
      url: 'https://shop.qa-test.example/products/shirt?utm_source=x',
      category: 'SPELLING',
      severity: 'MEDIUM',
      title,
    });
    expect(result.ok).toBe(true);
    return db.finding.findFirstOrThrow({ where: { projectId, title } });
  }

  it('adds pages once, normalised, and refuses other sites', async () => {
    await signInAs(pm);
    const result = await addPagesAction({
      code,
      urls: '/\nhttps://shop.qa-test.example/collections/all/\n/collections/all\nhttps://elsewhere.example/x',
    });
    expect(result.ok).toBe(true);
    const pages = await db.storefrontPage.findMany({ where: { projectId }, orderBy: { url: 'asc' } });
    expect(pages.map((page) => [page.url, page.pageType])).toEqual([
      ['https://shop.qa-test.example/', 'HOME'],
      ['https://shop.qa-test.example/collections/all', 'COLLECTION'],
    ]);
  });

  it('keeps a finding from the merchant until it is shared', async () => {
    const finding = await logFinding('Recieve is misspelled');
    expect(finding.url).toBe('https://shop.qa-test.example/products/shirt');
    expect(finding.status).toBe('REVIEWED');
    expect(finding.reference).toMatch(/^FND-\d+$/);

    await signInAs(merchant);
    const merchantPrincipal = await requirePrincipal();
    expect((await listFindings(merchantPrincipal, { projectCode: code, status: 'all' })).rows).toHaveLength(0);
    expect(await getFinding(merchantPrincipal, code, finding.reference)).toBeNull();

    await signInAs(dev);
    expect((await setFindingVisibilityAction({ code, findingIds: [finding.id], visible: true })).ok).toBe(false);

    await signInAs(pm);
    expect((await setFindingVisibilityAction({ code, findingIds: [finding.id], visible: true })).ok).toBe(true);

    await signInAs(merchant);
    const visible = await listFindings(merchantPrincipal, { projectCode: code, status: 'all' });
    expect(visible.rows.map((row) => row.id)).toEqual([finding.id]);
  });

  it('enforces the workflow and records every move', async () => {
    const finding = await logFinding('Hero headline overlaps on mobile');
    await signInAs(dev);

    const skip = await updateFindingAction({ code, findingId: finding.id, status: 'RESOLVED', note: 'x' });
    expect(skip.ok).toBe(false);

    expect((await updateFindingAction({ code, findingId: finding.id, status: 'IN_PROGRESS', assigneeId: dev.id })).ok).toBe(true);
    expect((await updateFindingAction({ code, findingId: finding.id, status: 'READY_FOR_VERIFICATION' })).ok).toBe(true);
    const noNote = await updateFindingAction({ code, findingId: finding.id, status: 'RESOLVED' });
    expect(noNote.ok).toBe(false);
    expect(
      (await updateFindingAction({ code, findingId: finding.id, status: 'RESOLVED', note: 'Checked on an iPhone.' })).ok,
    ).toBe(true);

    const after = await db.finding.findUniqueOrThrow({ where: { id: finding.id } });
    expect(after.status).toBe('RESOLVED');
    expect(after.verificationNote).toBe('Checked on an iPhone.');
    expect(after.assigneeId).toBe(dev.id);

    const events = await db.findingEvent.findMany({
      where: { findingId: finding.id, field: 'status' },
      orderBy: { createdAt: 'asc' },
    });
    expect(events.map((event) => event.toValue)).toEqual([
      'REVIEWED',
      'IN_PROGRESS',
      'READY_FOR_VERIFICATION',
      'RESOLVED',
    ]);
  });

  it('lets SHOPLINE report a finding but not triage it', async () => {
    await signInAs(am);
    const created = await createFindingAction({
      code,
      url: 'https://shop.qa-test.example/cart',
      category: 'BROKEN_LINK',
      title: 'Continue shopping link 404s',
    });
    expect(created.ok).toBe(true);
    const finding = await db.finding.findFirstOrThrow({ where: { projectId, title: 'Continue shopping link 404s' } });
    const update = await updateFindingAction({ code, findingId: finding.id, status: 'IN_PROGRESS' });
    expect(update.ok).toBe(false);
  });

  it('dismisses a false positive and never shares it', async () => {
    const finding = await logFinding('Brand name flagged as a typo');
    await signInAs(pm);
    expect((await markFalsePositiveAction({ code, findingId: finding.id, reason: 'It is the brand name.' })).ok).toBe(true);
    const after = await db.finding.findUniqueOrThrow({ where: { id: finding.id } });
    expect(after.status).toBe('DISMISSED');
    expect(after.falsePositive).toBe(true);
    expect((await setFindingVisibilityAction({ code, findingIds: [finding.id], visible: true })).ok).toBe(false);
  });

  it('lets the merchant talk on a shared finding only, always visibly', async () => {
    const hidden = await logFinding('Internal only finding');
    const shared = await logFinding('Shared finding for comments');
    await signInAs(pm);
    await setFindingVisibilityAction({ code, findingIds: [shared.id], visible: true });

    await signInAs(merchant);
    expect((await commentOnFindingAction({ code, findingId: hidden.id, body: 'Hello?' })).ok).toBe(false);
    expect(
      (await commentOnFindingAction({ code, findingId: shared.id, body: 'Fine to fix.', clientVisible: false })).ok,
    ).toBe(true);
    const merchantComment = await db.findingComment.findFirstOrThrow({ where: { findingId: shared.id } });
    expect(merchantComment.clientVisible).toBe(true);

    await signInAs(pm);
    await commentOnFindingAction({ code, findingId: shared.id, body: 'Internal: dev is on it.', clientVisible: false });

    await signInAs(merchant);
    const merchantView = await getFinding(await requirePrincipal(), code, shared.reference);
    expect(merchantView?.finding.comments.map((comment) => comment.body)).toEqual(['Fine to fix.']);
    expect(merchantView?.finding.events).toEqual([]);

    const pmNotified = await db.notification.findFirst({
      where: { userId: pm.id, projectId, type: 'MERCHANT_FEEDBACK' },
    });
    expect(pmNotified).not.toBeNull();
  });

  it('refuses a merchant creating a finding', async () => {
    await signInAs(merchant);
    const result = await createFindingAction({
      code,
      url: 'https://shop.qa-test.example/',
      category: 'OTHER',
      title: 'Merchant tries to file',
    });
    expect(result.ok).toBe(false);
  });
});
