import { describe, expect, it } from 'vitest';
import { effectivePermissions, ROLE_PERMISSIONS } from './matrix';

describe('effectivePermissions', () => {
  it('returns exactly the role default when there are no overrides', () => {
    expect(effectivePermissions('AHN_DEVELOPER', [])).toEqual(
      [...new Set(ROLE_PERMISSIONS.AHN_DEVELOPER)].sort(),
    );
  });

  it('adds a permission the role does not normally hold', () => {
    const result = effectivePermissions('AHN_DEVELOPER', [{ permission: 'invoice:read', granted: true }]);
    expect(result).toContain('invoice:read');
  });

  it('removes a permission the role normally holds', () => {
    const result = effectivePermissions('AHN_DEVELOPER', [
      { permission: 'asset:manage', granted: false },
    ]);
    expect(result).not.toContain('asset:manage');
  });

  it('lets a later override in the array win over an earlier one for the same permission', () => {
    const result = effectivePermissions('AHN_DEVELOPER', [
      { permission: 'invoice:read', granted: true },
      { permission: 'invoice:read', granted: false },
    ]);
    expect(result).not.toContain('invoice:read');
  });

  it('ignores an override naming a permission that does not exist, rather than throwing', () => {
    expect(() =>
      effectivePermissions('AHN_DEVELOPER', [{ permission: 'nonexistent:action', granted: true }]),
    ).not.toThrow();
    expect(effectivePermissions('AHN_DEVELOPER', [{ permission: 'nonexistent:action', granted: true }])).toEqual(
      effectivePermissions('AHN_DEVELOPER', []),
    );
  });
});
