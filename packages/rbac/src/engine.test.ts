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
import { navigationFor } from './navigation';

const principal = (role: UserRole, overrides: Partial<Principal> = {}): Principal => ({
  id: 'user-1',
  email: 'user@example.com',
  name: 'Test User',
  role,
  team: 'AHN',
  isActive: true,
  organizationId: 'org-1',
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

  it('gives an account manager the delivery section it exists for', () => {
    const groups = navigationFor(principal('SHOPLINE_ACCOUNT_MANAGER', { team: 'SHOPLINE' }));
    const hrefs = groups.flatMap((group) => group.items.map((item) => item.href));
    expect(hrefs).toContain('/blockers');
    expect(hrefs).toContain('/approvals');
    expect(hrefs).toContain('/invoices');
    expect(hrefs).not.toContain('/settings');
  });

  it('puts a merchant on the merchant surface only', () => {
    const groups = navigationFor(principal('MERCHANT', { team: 'MERCHANT' }));
    const hrefs = groups.flatMap((group) => group.items.map((item) => item.href));
    expect(hrefs.every((href) => href.startsWith('/portal'))).toBe(true);
  });
});
