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
 * The export route reuses `parseFilters` + `listProjects` verbatim, so this
 * proves only what is specific to being a download: the RBAC gates (the same
 * `project:read`/`invoice:read` the page itself checks), that a merchant
 * never sees another merchant's row, and that the query string filters the
 * file the same way it filters the screen.
 */
describe('GET /api/projects/export', () => {
  let pm: TestUser;
  let developer: TestUser;
  let merchant: TestUser;
  let otherMerchant: TestUser;
  let projectCode: string;
  let projectId: string;
  let otherProjectCode: string;

  beforeAll(async () => {
    pm = await createTestUser('AHN_PROJECT_MANAGER');
    developer = await createTestUser('AHN_DEVELOPER');
    merchant = await createTestUser('MERCHANT');
    otherMerchant = await createTestUser('MERCHANT');

    const project = await createTestProject({ as: pm, ahnProjectManagerId: pm.id });
    projectCode = project.code;
    projectId = project.id;
    await db.projectMember.create({ data: { projectId, userId: merchant.id } });

    const otherProject = await createTestProject({ as: pm, ahnProjectManagerId: pm.id });
    otherProjectCode = otherProject.code;
    await db.projectMember.create({
      data: { projectId: otherProject.id, userId: otherMerchant.id },
    });
  });

  afterAll(async () => {
    await cleanupFixtures();
  });

  it('refuses an unauthenticated request', async () => {
    await signOut();
    const response = await GET(new Request('http://test.local/api/projects/export'));
    expect(response.status).toBe(401);
  });

  it('streams a CSV with money columns for a role that holds invoice:read', async () => {
    await signInAs(pm);
    const response = await GET(new Request('http://test.local/api/projects/export'));

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/csv');
    expect(response.headers.get('content-disposition')).toContain(
      'attachment; filename="mercantor-portfolio-',
    );

    const csv = await response.text();
    const [header, ...rows] = csv.trim().split('\r\n');
    expect(header).toContain('Contract total');
    expect(rows.some((row) => row.startsWith(`${projectCode},`))).toBe(true);
  });

  it('omits money columns for a role without invoice:read', async () => {
    await signInAs(developer);
    const response = await GET(new Request('http://test.local/api/projects/export'));
    const csv = await response.text();
    const header = csv.trim().split('\r\n')[0]!;

    expect(header).not.toContain('Contract total');
    expect(header).not.toContain('Invoice status');
  });

  it("scopes a merchant to only their own project, never another merchant's row", async () => {
    await signInAs(merchant);
    const response = await GET(new Request('http://test.local/api/projects/export'));
    const csv = await response.text();

    expect(csv).toContain(projectCode);
    expect(csv).not.toContain(otherProjectCode);
  });

  it('applies the same query-string filters the portfolio page uses', async () => {
    await signInAs(pm);
    const response = await GET(
      new Request(`http://test.local/api/projects/export?q=${encodeURIComponent(projectCode)}`),
    );
    const csv = await response.text();
    const rows = csv.trim().split('\r\n').slice(1);

    expect(rows).toHaveLength(1);
    expect(rows[0]!.startsWith(`${projectCode},`)).toBe(true);
  });
});
