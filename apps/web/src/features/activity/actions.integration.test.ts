import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '@relay/db';
import { getProject } from '@/features/projects/queries';
import {
  cleanupFixtures,
  createTestProject,
  createTestUser,
  signInAs,
  type TestUser,
} from '../../../test/fixtures';
import { postCommentAction } from './actions';

/**
 * "Internal AHN notes must remain private" (D-009) is implemented as a query
 * predicate, not a UI concern: `readableVisibilities(principal)` goes into
 * the `where` clause, so a note somebody cannot read is never fetched. This
 * proves both halves through the real code path - writing is refused for a
 * visibility the writer cannot hold, and reading never returns a row above
 * the reader's level, for all three teams.
 */
describe('comment visibility per role', () => {
  let pm: TestUser;
  let am: TestUser;
  let merchant: TestUser;
  let projectCode: string;
  let projectId: string;

  beforeAll(async () => {
    pm = await createTestUser('AHN_PROJECT_MANAGER');
    am = await createTestUser('SHOPLINE_ACCOUNT_MANAGER');
    merchant = await createTestUser('MERCHANT');

    const project = await createTestProject({
      as: pm,
      ahnProjectManagerId: pm.id,
      shoplineAmId: am.id,
    });
    projectCode = project.code;
    projectId = project.id;

    // The merchant boundary is a `ProjectMember` row - there is no action for
    // this yet, so the fixture creates it directly, the way the seed script does.
    await db.projectMember.create({ data: { projectId, userId: merchant.id } });
  });

  afterAll(async () => {
    await cleanupFixtures();
  });

  it('AHN can write at every visibility level; SHOPLINE and the merchant cannot write INTERNAL_AHN', async () => {
    await signInAs(pm);
    const internal = await postCommentAction({
      code: projectCode,
      body: 'INTERNAL: the design rework cost us three days.',
      visibility: 'INTERNAL_AHN',
      category: 'GENERAL_UPDATE',
      status: 'NONE',
      mentions: [],
      alsoSlack: false,
    });
    expect(internal.ok).toBe(true);

    await signInAs(am);
    const shoplineAttempt = await postCommentAction({
      code: projectCode,
      body: 'SHOPLINE should never manage to post this.',
      visibility: 'INTERNAL_AHN',
      category: 'GENERAL_UPDATE',
      status: 'NONE',
      mentions: [],
      alsoSlack: false,
    });
    expect(shoplineAttempt.ok).toBe(false);
    if (!shoplineAttempt.ok) expect(shoplineAttempt.code).toBe('FORBIDDEN');

    const sharedByShopline = await postCommentAction({
      code: projectCode,
      body: 'Shared between AHN and SHOPLINE.',
      visibility: 'AHN_SHOPLINE',
      category: 'GENERAL_UPDATE',
      status: 'NONE',
      mentions: [],
      alsoSlack: false,
    });
    expect(sharedByShopline.ok).toBe(true);

    await signInAs(merchant);
    const merchantAttempt = await postCommentAction({
      code: projectCode,
      body: 'The merchant should never manage to post this either.',
      visibility: 'AHN_SHOPLINE',
      category: 'GENERAL_UPDATE',
      status: 'NONE',
      mentions: [],
      alsoSlack: false,
    });
    expect(merchantAttempt.ok).toBe(false);
    if (!merchantAttempt.ok) expect(merchantAttempt.code).toBe('FORBIDDEN');

    const everyone = await postCommentAction({
      code: projectCode,
      body: 'Visible to everyone, including the merchant.',
      visibility: 'EVERYONE',
      category: 'GENERAL_UPDATE',
      status: 'NONE',
      mentions: [],
      alsoSlack: false,
    });
    expect(everyone.ok).toBe(true);

    // Exactly three comments landed: the two refusals wrote nothing.
    const total = await db.comment.count({ where: { projectId } });
    expect(total).toBe(3);
  });

  it("a note above the reader's level is never fetched, for any of the three teams", async () => {
    await signInAs(pm);
    const asAhn = await getProject(pm, projectCode);
    expect(asAhn.comments).toHaveLength(3);

    await signInAs(am);
    const asShopline = await getProject(am, projectCode);
    expect(asShopline.comments).toHaveLength(2);
    expect(asShopline.comments.some((comment) => comment.visibility === 'INTERNAL_AHN')).toBe(
      false,
    );

    await signInAs(merchant);
    const asMerchant = await getProject(merchant, projectCode);
    expect(asMerchant.comments).toHaveLength(1);
    expect(asMerchant.comments.every((comment) => comment.visibility === 'EVERYONE')).toBe(true);
  });

  it('a merchant cannot open a project that is not theirs, even knowing its exact code', async () => {
    const otherPm = await createTestUser('AHN_PROJECT_MANAGER');
    const other = await createTestProject({ as: otherPm, ahnProjectManagerId: otherPm.id });

    await signInAs(merchant);
    await expect(getProject(merchant, other.code)).rejects.toThrow();
  });
});

/**
 * A reply is a comment with a `parentId` - the same `postCommentAction`, the
 * same visibility rules, nothing threading-specific to bypass. This proves
 * the parent is validated against the project (never a foreign comment id)
 * and that the reply reads back linked to it.
 */
describe('threaded replies', () => {
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

  it('a reply carries the parent id, and reads back linked to it', async () => {
    const root = await postCommentAction({
      code: projectCode,
      body: 'Where are we on the redirect map?',
      category: 'GENERAL_UPDATE',
      visibility: 'AHN_SHOPLINE',
      status: 'NONE',
      mentions: [],
      alsoSlack: false,
    });
    expect(root.ok).toBe(true);

    const rootRow = await db.comment.findFirstOrThrow({
      where: { projectId, body: 'Where are we on the redirect map?' },
      select: { id: true },
    });

    const reply = await postCommentAction({
      code: projectCode,
      body: 'Uploaded it yesterday - check the assets tab.',
      category: 'GENERAL_UPDATE',
      visibility: 'AHN_SHOPLINE',
      status: 'NONE',
      parentId: rootRow.id,
      mentions: [],
      alsoSlack: false,
    });
    expect(reply.ok).toBe(true);

    const project = await getProject(pm, projectCode);
    const found = project.comments.find((c) => c.body.startsWith('Uploaded it yesterday'));
    expect(found?.parentId).toBe(rootRow.id);
  });

  it('refuses a parent id that is not a comment on this project', async () => {
    const other = await createTestProject({ as: pm, ahnProjectManagerId: pm.id });
    const foreignRoot = await postCommentAction({
      code: other.code,
      body: 'A comment on a different project.',
      category: 'GENERAL_UPDATE',
      visibility: 'AHN_SHOPLINE',
      status: 'NONE',
      mentions: [],
      alsoSlack: false,
    });
    expect(foreignRoot.ok).toBe(true);
    const foreignRow = await db.comment.findFirstOrThrow({
      where: { projectId: other.id },
      select: { id: true },
    });

    const result = await postCommentAction({
      code: projectCode,
      body: 'This should not attach to a comment on another project.',
      category: 'GENERAL_UPDATE',
      visibility: 'AHN_SHOPLINE',
      status: 'NONE',
      parentId: foreignRow.id,
      mentions: [],
      alsoSlack: false,
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.code).toBe('CONFLICT');
  });
});
