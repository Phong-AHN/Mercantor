import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '@relay/db';
import {
  cleanupFixtures,
  createTestProject,
  createTestUser,
  signInAs,
  signOut,
  type TestUser,
} from '../../../../../test/fixtures';
import { GET } from './route';

/**
 * A security fix, not a routine test: this route only ever checked project
 * membership (`resolveProject`), never the visibility of the comment a file
 * is attached to. D-009's whole point is that an `INTERNAL_AHN` note never
 * reaches SHOPLINE or the merchant, and D-043 #3 already fixed the activity
 * feed leaking that such a file existed - but the file itself stayed
 * reachable by anyone who ever got the direct `/api/attachments/<id>` link,
 * regardless of role. Same `readableVisibilities` predicate the comment
 * thread itself already uses, applied here.
 */
describe('GET /api/attachments/[id]', () => {
  let pm: TestUser;
  let am: TestUser;
  let merchant: TestUser;
  let projectId: string;
  let internalAttachmentId: string;
  let sharedAttachmentId: string;

  beforeAll(async () => {
    pm = await createTestUser('AHN_PROJECT_MANAGER');
    am = await createTestUser('SHOPLINE_ACCOUNT_MANAGER');
    merchant = await createTestUser('MERCHANT');

    const project = await createTestProject({ as: pm, ahnProjectManagerId: pm.id });
    projectId = project.id;
    await db.projectMember.create({ data: { projectId, userId: merchant.id } });

    const internalComment = await db.comment.create({
      data: {
        projectId,
        authorId: pm.id,
        body: 'Internal-only note with a file attached.',
        category: 'GENERAL_UPDATE',
        visibility: 'INTERNAL_AHN',
      },
      select: { id: true },
    });
    const internalAttachment = await db.attachment.create({
      data: {
        projectId,
        kind: 'FILE',
        label: 'internal-only.png',
        url: '/api/attachments/placeholder',
        storageKey: `test/${internalComment.id}/internal-only.png`,
        mimeType: 'image/png',
        commentId: internalComment.id,
      },
      select: { id: true },
    });
    internalAttachmentId = internalAttachment.id;

    const sharedAttachment = await db.attachment.create({
      data: {
        projectId,
        kind: 'FILE',
        label: 'shared.png',
        url: '/api/attachments/placeholder',
        storageKey: `test/no-comment/shared.png`,
        mimeType: 'image/png',
      },
      select: { id: true },
    });
    sharedAttachmentId = sharedAttachment.id;
  });

  afterAll(async () => {
    await cleanupFixtures();
  });

  it('refuses an unauthenticated request', async () => {
    await signOut();
    const response = await GET(
      new Request(`http://test.local/api/attachments/${internalAttachmentId}`),
      {
        params: Promise.resolve({ id: internalAttachmentId }),
      },
    );
    expect(response.status).toBe(401);
  });

  it('lets AHN (comment:internal) download a file attached to an INTERNAL_AHN comment', async () => {
    await signInAs(pm);
    const response = await GET(
      new Request(`http://test.local/api/attachments/${internalAttachmentId}`),
      {
        params: Promise.resolve({ id: internalAttachmentId }),
      },
    );
    expect(response.status).toBe(307);
  });

  it('refuses a SHOPLINE account manager the same file - it does not even reveal whether it exists', async () => {
    await signInAs(am);
    const response = await GET(
      new Request(`http://test.local/api/attachments/${internalAttachmentId}`),
      {
        params: Promise.resolve({ id: internalAttachmentId }),
      },
    );
    expect(response.status).toBe(404);
  });

  it('refuses the merchant the same file', async () => {
    await signInAs(merchant);
    const response = await GET(
      new Request(`http://test.local/api/attachments/${internalAttachmentId}`),
      {
        params: Promise.resolve({ id: internalAttachmentId }),
      },
    );
    expect(response.status).toBe(404);
  });

  it('a file with no comment attached is unaffected - normal project scoping still applies', async () => {
    await signInAs(am);
    const response = await GET(
      new Request(`http://test.local/api/attachments/${sharedAttachmentId}`),
      {
        params: Promise.resolve({ id: sharedAttachmentId }),
      },
    );
    expect(response.status).toBe(307);
  });
});
