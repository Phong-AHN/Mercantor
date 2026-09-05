import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '@relay/db';
import { headObject } from '@relay/storage';
import { postCommentAction } from '@/features/activity/actions';
import {
  cleanupFixtures,
  createTestProject,
  createTestUser,
  signInAs,
  type TestUser,
} from '../../../test/fixtures';
import { confirmUploadAction, requestUploadAction } from './actions';

/**
 * The two-step handshake, proved against the real MinIO container
 * `pnpm infra:up` starts alongside Postgres - not a mock. `requestUploadAction`
 * only ever hands out a signature; `confirmUploadAction` is where the real
 * bytes get checked, so these tests exercise both real S3 calls and the
 * sniff-vs-declared comparison the confirm step is built around.
 */
describe('file upload', () => {
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

  it('rejects a type that is not on the allowlist before touching storage', async () => {
    const result = await requestUploadAction({
      code: projectCode,
      contentType: 'application/x-msdownload',
      sizeBytes: 1024,
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.fieldErrors?.contentType).toBeTruthy();
  });

  it('rejects a declared size over the cap before touching storage', async () => {
    const result = await requestUploadAction({
      code: projectCode,
      contentType: 'image/png',
      sizeBytes: 30 * 1024 * 1024,
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.fieldErrors?.sizeBytes).toBeTruthy();
  });

  it('presigns an upload scoped to this project for an accepted type', async () => {
    const result = await requestUploadAction({
      code: projectCode,
      contentType: 'image/png',
      sizeBytes: 1024,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.data.key.startsWith(`project/${projectId}/`)).toBe(true);
    expect(result.data.key.endsWith('.png')).toBe(true);
    expect(result.data.url).toBeTruthy();
    expect(result.data.fields.key).toBe(result.data.key);
  });

  it('a real upload whose bytes match the declared type is attached', async () => {
    const requested = await requestUploadAction({
      code: projectCode,
      contentType: 'image/png',
      sizeBytes: PNG_BYTES.length,
    });
    expect(requested.ok).toBe(true);
    if (!requested.ok) throw new Error('unreachable');

    await postToPresignedUrl(requested.data.url, requested.data.fields, PNG_BYTES, 'a.png');

    const confirmed = await confirmUploadAction({
      code: projectCode,
      key: requested.data.key,
      label: 'Brand logo',
      contentType: requested.data.mimeType,
    });
    expect(confirmed.ok).toBe(true);
    if (!confirmed.ok) throw new Error('unreachable');

    const attachment = await db.attachment.findUniqueOrThrow({
      where: { id: confirmed.data.id },
      select: {
        kind: true,
        label: true,
        mimeType: true,
        sizeBytes: true,
        storageKey: true,
        url: true,
      },
    });
    expect(attachment.kind).toBe('FILE');
    expect(attachment.mimeType).toBe('image/png');
    expect(attachment.sizeBytes).toBe(PNG_BYTES.length);
    expect(attachment.storageKey).toBe(requested.data.key);
    expect(attachment.url).toBe(`/api/attachments/${confirmed.data.id}`);
  });

  it('real bytes that disagree with the declared type are rejected and deleted, never attached', async () => {
    const requested = await requestUploadAction({
      code: projectCode,
      contentType: 'image/png',
      sizeBytes: PLAIN_TEXT_BYTES.length,
    });
    expect(requested.ok).toBe(true);
    if (!requested.ok) throw new Error('unreachable');

    // Uploads plain text under a key and content-type presigned for a PNG.
    await postToPresignedUrl(requested.data.url, requested.data.fields, PLAIN_TEXT_BYTES, 'a.png');

    const confirmed = await confirmUploadAction({
      code: projectCode,
      key: requested.data.key,
      label: 'Disguised file',
      contentType: requested.data.mimeType,
    });
    expect(confirmed.ok).toBe(false);

    const head = await headObject(requested.data.key);
    expect(head).toBeNull();

    const attachment = await db.attachment.findFirst({
      where: { storageKey: requested.data.key },
    });
    expect(attachment).toBeNull();
  });

  it('a file attached to an INTERNAL_AHN comment logs its activity row at that same visibility, never EVERYONE', async () => {
    const posted = await postCommentAction({
      code: projectCode,
      body: 'INTERNAL: the merchant disputed this invoice, do not mention it yet.',
      visibility: 'INTERNAL_AHN',
      category: 'GENERAL_UPDATE',
      status: 'NONE',
      mentions: [],
      alsoSlack: false,
    });
    expect(posted.ok).toBe(true);
    const comment = await db.comment.findFirstOrThrow({
      where: { projectId, visibility: 'INTERNAL_AHN' },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });

    const requested = await requestUploadAction({
      code: projectCode,
      contentType: 'image/png',
      sizeBytes: PNG_BYTES.length,
    });
    expect(requested.ok).toBe(true);
    if (!requested.ok) throw new Error('unreachable');
    await postToPresignedUrl(requested.data.url, requested.data.fields, PNG_BYTES, 'a.png');

    const confirmed = await confirmUploadAction({
      code: projectCode,
      key: requested.data.key,
      label: 'credit-dispute-details.png',
      contentType: requested.data.mimeType,
      commentId: comment.id,
    });
    expect(confirmed.ok).toBe(true);
    if (!confirmed.ok) throw new Error('unreachable');

    const activity = await db.activityEvent.findFirstOrThrow({
      where: {
        projectId,
        type: 'ASSET_STATUS_CHANGED',
        summary: 'File attached: credit-dispute-details.png',
      },
      orderBy: { occurredAt: 'desc' },
      select: { visibility: true },
    });
    expect(activity.visibility).toBe('INTERNAL_AHN');
  });

  it('refuses to attach a file against a comment id from another project', async () => {
    const other = await createTestProject({ as: pm, ahnProjectManagerId: pm.id });
    const otherComment = await db.comment.create({
      data: {
        projectId: other.id,
        authorId: pm.id,
        body: 'A note on the other project.',
        category: 'GENERAL_UPDATE',
        visibility: 'AHN_SHOPLINE',
      },
      select: { id: true },
    });

    const requested = await requestUploadAction({
      code: projectCode,
      contentType: 'image/png',
      sizeBytes: PNG_BYTES.length,
    });
    expect(requested.ok).toBe(true);
    if (!requested.ok) throw new Error('unreachable');
    await postToPresignedUrl(requested.data.url, requested.data.fields, PNG_BYTES, 'a.png');

    const confirmed = await confirmUploadAction({
      code: projectCode,
      key: requested.data.key,
      label: 'Cross-project comment',
      contentType: requested.data.mimeType,
      commentId: otherComment.id,
    });
    expect(confirmed.ok).toBe(false);
    if (confirmed.ok) throw new Error('unreachable');
    expect(confirmed.code).toBe('FORBIDDEN');
  });

  it('refuses to confirm a key presigned for a different project', async () => {
    const other = await createTestProject({ as: pm, ahnProjectManagerId: pm.id });
    const requested = await requestUploadAction({
      code: other.code,
      contentType: 'image/png',
      sizeBytes: PNG_BYTES.length,
    });
    expect(requested.ok).toBe(true);
    if (!requested.ok) throw new Error('unreachable');
    await postToPresignedUrl(requested.data.url, requested.data.fields, PNG_BYTES, 'a.png');

    const confirmed = await confirmUploadAction({
      code: projectCode,
      key: requested.data.key,
      label: 'Cross-project',
      contentType: requested.data.mimeType,
    });
    expect(confirmed.ok).toBe(false);
    if (confirmed.ok) throw new Error('unreachable');
    expect(confirmed.code).toBe('FORBIDDEN');
  });
});

/** The smallest possible valid PNG - an 8-byte signature plus a IEND chunk
 * is enough for the magic-number sniff; the file need not decode as an image. */
const PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44,
  0xae, 0x42, 0x60, 0x82,
]);

const PLAIN_TEXT_BYTES = Buffer.from('this is not a png, whatever the extension says');

/** Mirrors what `FileUploadButton` does in the browser: every returned
 * `fields` entry, then the file content itself, appended last. */
async function postToPresignedUrl(
  url: string,
  fields: Record<string, string>,
  bytes: Buffer,
  filename: string,
): Promise<void> {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  form.append('file', new Blob([Uint8Array.from(bytes)]), filename);

  const response = await fetch(url, { method: 'POST', body: form });
  if (!response.ok) {
    throw new Error(`presigned POST failed: ${response.status} ${await response.text()}`);
  }
}
