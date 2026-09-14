import { describe, expect, it } from 'vitest';
import type { UserRole } from '@relay/core';
import { USER_ROLES } from '@relay/core';
import {
  can,
  canDecideApproval,
  isConfinedToOwnProjects,
  projectScopeWhere,
  readableVisibilities,
  type Principal,
} from './engine';
import { ROLE_PERMISSIONS } from './matrix';
import { landingPathFor, navigationFor } from './navigation';

const principal = (role: UserRole, overrides: Partial<Principal> = {}): Principal => ({
  id: 'user-1',
  email: 'user@example.com',
  name: 'Test User',
  role,
  team: 'AHN',
  isActive: true,
  organizationId: 'org-1',
  permissions: ROLE_PERMISSIONS[role],
  ...overrides,
});

describe('can', () => {
  it('denies every permission to a deactivated user', () => {
    const user = principal('AHN_ADMIN', { isActive: false });
    expect(can(user, 'project:read')).toBe(false);
    expect(can(user, 'settings:manage')).toBe(false);
  });

  it('keeps money away from developers and solutions engineers', () => {
    expect(can(principal('AHN_DEVELOPER'), 'invoice:read')).toBe(false);
    expect(can(principal('SHOPLINE_SOLUTIONS_ENGINEER'), 'invoice:read')).toBe(false);
    expect(can(principal('AHN_PROJECT_MANAGER'), 'invoice:manage')).toBe(true);
  });

  it('never grants a merchant anything commercial or internal', () => {
    const merchant = principal('MERCHANT', { team: 'MERCHANT' });
    expect(can(merchant, 'invoice:read')).toBe(false);
    expect(can(merchant, 'comment:internal')).toBe(false);
    expect(can(merchant, 'blocker:manage')).toBe(false);
    expect(can(merchant, 'portfolio:read')).toBe(false);
    expect(can(merchant, 'user:read')).toBe(false);
  });

  it('never grants SHOPLINE the internal AHN note', () => {
    for (const role of USER_ROLES.filter((r) => r.startsWith('SHOPLINE'))) {
      expect(can(principal(role, { team: 'SHOPLINE' }), 'comment:internal')).toBe(false);
    }
  });

  it('confines PLATFORM_ADMIN to the platform itself - no project, invoice or delivery visibility', () => {
    const admin = principal('PLATFORM_ADMIN', { organizationId: null });
    expect(can(admin, 'platform:manage')).toBe(true);
    expect(can(admin, 'merchant:manage')).toBe(true);

    for (const permission of [
      'portfolio:read',
      'project:read',
      'project:create',
      'invoice:read',
      'invoice:manage',
      'blocker:read',
      'issue:read',
      'approval:read',
      'handoff:decide',
      'comment:read',
      'integration:read',
      'settings:manage',
      'audit:read',
      'user:read',
    ] as const) {
      expect(can(admin, permission)).toBe(false);
    }
  });

  it('reads permissions off the principal, so a PLATFORM_ADMIN override takes effect without touching the matrix', () => {
    // A revoke: this role would normally have it.
    const revoked = principal('AHN_DEVELOPER', {
      permissions: ROLE_PERMISSIONS.AHN_DEVELOPER.filter((p) => p !== 'asset:manage'),
    });
    expect(can(revoked, 'asset:manage')).toBe(false);

    // A grant: this role would not normally have it.
    const granted = principal('AHN_DEVELOPER', {
      permissions: [...ROLE_PERMISSIONS.AHN_DEVELOPER, 'invoice:read'],
    });
    expect(can(granted, 'invoice:read')).toBe(true);
  });
});

describe('readableVisibilities', () => {
  it('hides AHN internal notes from SHOPLINE and the merchant', () => {
    expect(readableVisibilities(principal('AHN_PROJECT_MANAGER'))).toContain('INTERNAL_AHN');
    expect(readableVisibilities(principal('SHOPLINE_ADMIN', { team: 'SHOPLINE' }))).toEqual([
      'AHN_SHOPLINE',
      'EVERYONE',
    ]);
    expect(readableVisibilities(principal('MERCHANT', { team: 'MERCHANT' }))).toEqual(['EVERYONE']);
  });
});

describe('projectScopeWhere', () => {
  it('confines a merchant to projects they are a member of', () => {
    const merchant = principal('MERCHANT', { team: 'MERCHANT' });
    expect(isConfinedToOwnProjects(merchant)).toBe(true);
    expect(projectScopeWhere(merchant)).toEqual({
      deletedAt: null,
      members: { some: { userId: 'user-1' } },
    });
  });

  it("lets internal roles see their own organization's portfolio, minus deleted records", () => {
    expect(projectScopeWhere(principal('SHOPLINE_ACCOUNT_MANAGER', { team: 'SHOPLINE' }))).toEqual({
      deletedAt: null,
      organizationId: 'org-1',
    });
  });

  it('scopes by role, not by the team column, so a stale team cannot widen access', () => {
    // Role says MERCHANT; the row still carries an AHN team from before a change.
    const stale = principal('MERCHANT', { team: 'AHN' });
    expect(projectScopeWhere(stale)).toMatchObject({ members: { some: { userId: 'user-1' } } });
  });

  it('lets PLATFORM_ADMIN (no organization of its own) see every tenant', () => {
    const admin = principal('PLATFORM_ADMIN', { organizationId: null });
    expect(projectScopeWhere(admin)).toEqual({ deletedAt: null });
  });

  it("scopes a second organization's staff to their own portfolio, never another tenant's", () => {
    const otherOrg = principal('AHN_PROJECT_MANAGER', { organizationId: 'org-2' });
    expect(projectScopeWhere(otherOrg)).toEqual({
      deletedAt: null,
      organizationId: 'org-2',
    });
  });
});

describe('canDecideApproval', () => {
  it('routes each checkpoint to the side that owns it', () => {
    const pm = principal('AHN_PROJECT_MANAGER');
    const shopline = principal('SHOPLINE_ACCOUNT_MANAGER', { team: 'SHOPLINE' });
    const merchant = principal('MERCHANT', { team: 'MERCHANT' });

    expect(canDecideApproval(pm, 'QA')).toBe(true);
    expect(canDecideApproval(pm, 'SHOPLINE_DEPLOYMENT')).toBe(false);
    expect(canDecideApproval(shopline, 'SHOPLINE_DEPLOYMENT')).toBe(true);
    expect(canDecideApproval(shopline, 'DESIGN')).toBe(false);
    expect(canDecideApproval(merchant, 'MERCHANT_FINAL')).toBe(true);
    expect(canDecideApproval(merchant, 'QA')).toBe(false);
  });
});

describe('navigationFor', () => {
  it('gives every non-merchant role at least one destination', () => {
    for (const role of USER_ROLES.filter((r) => r !== 'MERCHANT')) {
      const groups = navigationFor(principal(role, { team: 'AHN' }));
      expect(groups.length).toBeGreaterThan(0);
      expect(groups.flatMap((g) => g.items).length).toBeGreaterThan(0);
    }
  });

  it('gives an account manager the delivery section, but never commercial figures', () => {
    const groups = navigationFor(principal('SHOPLINE_ACCOUNT_MANAGER', { team: 'SHOPLINE' }));
    const hrefs = groups.flatMap((group) => group.items.map((item) => item.href));
    expect(hrefs).toContain('/blockers');
    expect(hrefs).toContain('/approvals');
    // SHOPLINE never sees a project's commercial figures - AHN's contract
    // value with the merchant, milestone billing, overdue balances.
    expect(hrefs).not.toContain('/invoices');
    expect(hrefs).not.toContain('/settings');
  });

  it('gives PLATFORM_ADMIN exactly one destination: the platform screen itself', () => {
    const groups = navigationFor(principal('PLATFORM_ADMIN', { organizationId: null }));
    const hrefs = groups.flatMap((group) => group.items.map((item) => item.href));
    expect(hrefs).toEqual(['/admin/platform']);
  });

  it('puts a merchant on the merchant surface only', () => {
    const groups = navigationFor(principal('MERCHANT', { team: 'MERCHANT' }));
    const hrefs = groups.flatMap((group) => group.items.map((item) => item.href));
    expect(hrefs.every((href) => href.startsWith('/portal'))).toBe(true);
  });
});

describe('landingPathFor', () => {
  it('sends a merchant to the portal and a portfolio-reading role to the dashboard', () => {
    expect(landingPathFor(principal('MERCHANT', { team: 'MERCHANT' }))).toBe('/portal');
    expect(landingPathFor(principal('AHN_PROJECT_MANAGER'))).toBe('/dashboard');
  });

  it('falls back to the project list for project:read without portfolio:read', () => {
    const projectOnly = principal('AHN_DEVELOPER', { permissions: ['project:read'] });
    expect(landingPathFor(projectOnly)).toBe('/projects');
  });

  it('sends PLATFORM_ADMIN to the platform screen, not the project list it cannot open', () => {
    expect(landingPathFor(principal('PLATFORM_ADMIN', { organizationId: null }))).toBe(
      '/admin/platform',
    );
  });
});
