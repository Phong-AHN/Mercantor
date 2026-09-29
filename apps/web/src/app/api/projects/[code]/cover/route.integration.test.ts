import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '@relay/db';
import {
  cleanupFixtures,
  createTestProject,
  createTestUser,
  signInAs,
  type TestUser,
} from '../../../../../../test/fixtures';
import { DELETE, GET, POST } from './route';

// Smallest valid PNG: 1x1, one transparent pixel.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

function upload(code: string, body: Blob, origin = 'http://localhost:3000') {
  const form = new FormData();
  form.append('file', body, 'cover');
  return POST(
    new Request(`http://localhost:3000/api/projects/${code}/cover`, {
      method: 'POST',
      body: form,
      headers: { origin, host: 'localhost:3000' },
    }),
    { params: Promise.resolve({ code }) },
  );
}

describe('/api/projects/[code]/cover', () => {
  let pm: TestUser;
  let am: TestUser;
  let code: string;
  let projectId: string;

  beforeAll(async () => {
    pm = await createTestUser('AHN_PROJECT_MANAGER');
    am = await createTestUser('SHOPLINE_ACCOUNT_MANAGER');
    const project = await createTestProject({ as: pm, ahnProjectManagerId: pm.id });
    code = project.code;
    projectId = project.id;
  });

  afterAll(async () => {
    await cleanupFixtures();
  });

  it('has nothing to serve before a cover is uploaded', async () => {
    await signInAs(pm);
    const response = await GET(new Request('http://localhost:3000/'), {
      params: Promise.resolve({ code }),
    });
    expect(response.status).toBe(404);
  });

  it('refuses a cross-site upload', async () => {
    await signInAs(pm);
    const response = await upload(
      code,
      new Blob([PNG], { type: 'image/png' }),
      'https://evil.example',
    );
    expect(response.status).toBe(403);
  });

  it('refuses a role without project:update', async () => {
    await signInAs(am);
    const response = await upload(code, new Blob([PNG], { type: 'image/png' }));
    expect(response.status).toBe(403);
  });

  it('refuses a file that is not an image, whatever it claims to be', async () => {
    await signInAs(pm);
    const response = await upload(code, new Blob(['not an image'], { type: 'image/png' }));
    expect(response.status).toBe(422);
  });

  it('stores, serves and removes a real image', async () => {
    await signInAs(pm);
    expect((await upload(code, new Blob([PNG], { type: 'image/png' }))).status).toBe(200);
    const stored = await db.project.findUniqueOrThrow({
      where: { id: projectId },
      select: { coverImageKey: true, coverImageUpdatedAt: true },
    });
    expect(stored.coverImageKey).toMatch(new RegExp(`^project/${projectId}/`));
    expect(stored.coverImageUpdatedAt).not.toBeNull();

    const served = await GET(new Request('http://localhost:3000/'), {
      params: Promise.resolve({ code }),
    });
    expect(served.status).toBe(200);
    expect(served.headers.get('content-type')).toBe('image/png');

    const removed = await DELETE(
      new Request(`http://localhost:3000/api/projects/${code}/cover`, {
        method: 'DELETE',
        headers: { origin: 'http://localhost:3000', host: 'localhost:3000' },
      }),
      { params: Promise.resolve({ code }) },
    );
    expect(removed.status).toBe(200);
    const after = await db.project.findUniqueOrThrow({
      where: { id: projectId },
      select: { coverImageKey: true },
    });
    expect(after.coverImageKey).toBeNull();
  });
});
