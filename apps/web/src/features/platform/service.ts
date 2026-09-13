import 'server-only';
import { USER_ROLES, type UserRole } from '@relay/core';
import { db } from '@relay/db';
import { effectivePermissions, PERMISSIONS, ROLE_PERMISSIONS, type Permission } from '@relay/rbac';

/**
 * The `/admin/platform` screen's two sections: the shared fallback
 * credentials (`PlatformIntegration`) and the role permission matrix
 * (`ROLE_PERMISSIONS` plus any `RolePermissionOverride` rows on top).
 * PLATFORM_ADMIN itself is excluded from the matrix everywhere here - it
 * always holds every permission in code (`matrix.ts`), and letting an
 * override touch that role risks locking every operator out of the portal
 * that is supposed to fix it.
 */

export const OVERRIDABLE_ROLES: readonly UserRole[] = USER_ROLES.filter(
  (role) => role !== 'PLATFORM_ADMIN',
);

export interface RoleMatrixCell {
  role: UserRole;
  permission: Permission;
  /** What `can()` actually resolves to right now, override included. */
  granted: boolean;
  /** Whether this cell differs from `ROLE_PERMISSIONS`, i.e. is overridden. */
  overridden: boolean;
}

export interface RoleMatrix {
  permissions: readonly Permission[];
  roles: readonly UserRole[];
  cells: RoleMatrixCell[];
  updatedAt: Date | null;
  updatedByName: string | null;
}

export async function getRoleMatrix(): Promise<RoleMatrix> {
  const overrides = await db.rolePermissionOverride.findMany({
    select: { role: true, permission: true, granted: true, updatedAt: true, updatedBy: { select: { name: true } } },
    orderBy: { updatedAt: 'desc' },
  });

  const overridesByRole = new Map<UserRole, typeof overrides>();
  for (const override of overrides) {
    const list = overridesByRole.get(override.role) ?? [];
    list.push(override);
    overridesByRole.set(override.role, list);
  }

  const cells: RoleMatrixCell[] = [];
  for (const role of OVERRIDABLE_ROLES) {
    const roleOverrides = overridesByRole.get(role) ?? [];
    const effective = new Set(effectivePermissions(role, roleOverrides));
    const roleOverrideMap = new Map(roleOverrides.map((o) => [o.permission, o.granted]));
    for (const permission of PERMISSIONS) {
      const defaultGranted = ROLE_PERMISSIONS[role].includes(permission);
      const override = roleOverrideMap.get(permission);
      cells.push({
        role,
        permission,
        granted: effective.has(permission),
        overridden: override !== undefined && override !== defaultGranted,
      });
    }
  }

  return {
    permissions: PERMISSIONS,
    roles: OVERRIDABLE_ROLES,
    cells,
    updatedAt: overrides[0]?.updatedAt ?? null,
    updatedByName: overrides[0]?.updatedBy?.name ?? null,
  };
}
