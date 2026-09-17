import type { UserRole } from '@relay/core';
import { PERMISSIONS, type Permission } from './permissions';

/**
 * The grant matrix. Deny by default: a role holds exactly what is listed here
 * and nothing more. Every cell is a decision - if a role is missing a
 * permission it is because somebody decided it should not have it.
 */
const AHN_DELIVERY: Permission[] = [
  'portfolio:read',
  'project:read',
  'project:update',
  'project:advance_stage',
  'merchant:read',
  'blocker:read',
  'blocker:manage',
  'scope:read',
  'scope:manage',
  'access:read',
  'access:manage',
  'asset:read',
  'asset:manage',
  'asset:upload',
  'activity:read',
  'comment:read',
  'comment:create',
  'comment:manage',
  'comment:internal',
  'issue:read',
  'issue:create',
  'issue:manage',
  'approval:read',
  'approval:request',
  'integration:read',
  'user:read',
];

// No `invoice:read` here, on purpose - SHOPLINE never sees a project's
// commercial figures (AHN's contract value with the merchant, milestone
// billing, overdue balances). Was previously inherited by SHOPLINE_ADMIN
// and SHOPLINE_ACCOUNT_MANAGER through this base, filtered back out only
// for SHOPLINE_SOLUTIONS_ENGINEER - now consistent across all three.
const SHOPLINE_BASE: Permission[] = [
  'portfolio:read',
  'project:read',
  'project:create',
  'merchant:read',
  'blocker:read',
  'scope:read',
  'access:read',
  'asset:read',
  'activity:read',
  'comment:read',
  'comment:create',
  'issue:read',
  'issue:create',
  'approval:read',
  'approval:decide_shopline',
  'handoff:decide',
  'introduction:send',
  'integration:read',
  'user:read',
];

export const ROLE_PERMISSIONS: Record<UserRole, readonly Permission[]> = {
  // Operates the *platform*, not any one merchant's migration - deliberately
  // narrow, not "full reach." No project, invoice, or delivery visibility at
  // all: PLATFORM_ADMIN cannot open a project, see a blocker, an approval, an
  // invoice, or a Slack/ClickUp message. `merchant:manage` is the one
  // exception, and only for the single action it gates
  // (`inviteMerchantAction`) - creating a merchant's login is account
  // administration, the same job as everything else this role does, not a
  // window into that merchant's project. `projectScopeWhere` still lets this
  // role's *role* reach every organization's projects unfiltered (needed for
  // that one action, and for `platform:manage` screens that list across
  // tenants), but with no `project:read`/`portfolio:read` there is no page
  // left that would actually render one.
  PLATFORM_ADMIN: ['platform:manage', 'merchant:manage'],

  AHN_ADMIN: [
    ...AHN_DELIVERY,
    'project:create',
    'project:delete',
    'project:assign',
    'merchant:manage',
    'invoice:read',
    'invoice:manage',
    'approval:decide_internal',
    'approval:decide_merchant',
    'handoff:submit',
    'introduction:send',
    'integration:manage',
    'user:manage',
    'audit:read',
    'settings:manage',
  ],

  AHN_PROJECT_MANAGER: [
    ...AHN_DELIVERY,
    'project:create',
    'project:assign',
    'merchant:manage',
    'invoice:read',
    'invoice:manage',
    'approval:decide_internal',
    // A PM may record a merchant decision that arrived by email or on a call.
    // The approval row keeps who recorded it and who decided it apart.
    'approval:decide_merchant',
    'handoff:submit',
    'introduction:send',
    'integration:manage',
    'audit:read',
  ],

  // Builds and tests. Deliberately no money: the brief scopes AHN delivery
  // roles to project, development, QA, issues and merchant communication.
  AHN_DEVELOPER: [...AHN_DELIVERY, 'approval:decide_internal'],

  // Same grant as AHN_PROJECT_MANAGER, by explicit request - the split from
  // that role is for the People page's own grouping (a design lead is easier
  // to find in its own card than folded into every other AHN role), not a
  // narrower permission set.
  AHN_DESIGNER: [
    ...AHN_DELIVERY,
    'project:create',
    'project:assign',
    'merchant:manage',
    'invoice:read',
    'invoice:manage',
    'approval:decide_internal',
    'approval:decide_merchant',
    'handoff:submit',
    'introduction:send',
    'integration:manage',
    'audit:read',
  ],

  SHOPLINE_ADMIN: [
    ...SHOPLINE_BASE,
    'project:update',
    'project:assign',
    'merchant:manage',
    'issue:manage',
    'comment:manage',
    'integration:manage',
    'user:manage',
    'audit:read',
    'settings:manage',
  ],

  SHOPLINE_ACCOUNT_MANAGER: [...SHOPLINE_BASE, 'project:assign', 'comment:manage'],

  // Technical counterpart: same visibility, no commercial or assignment rights.
  SHOPLINE_SOLUTIONS_ENGINEER: [...SHOPLINE_BASE, 'issue:manage'],

  // Optional limited access: upload assets, provide access, review designs,
  // give feedback, approve. Nothing else - and never anything commercial.
  MERCHANT: [
    'project:read',
    'access:read',
    'access:provide',
    'asset:read',
    'asset:upload',
    'activity:read',
    'comment:read',
    'comment:create',
    'issue:create',
    'issue:read',
    'approval:read',
    'approval:decide_merchant',
    'scope:read',
  ],
};

/** Sorted, de-duplicated, for the admin screen that renders the matrix. */
export function permissionsForRole(role: UserRole): Permission[] {
  return [...new Set(ROLE_PERMISSIONS[role])].sort();
}

/**
 * A `RolePermissionOverride` row as loaded from the database: `permission`
 * is a plain string there (there is no Postgres enum matching the
 * `Permission` union), so it is validated against `PERMISSIONS` here rather
 * than trusted at the type level.
 */
export interface RolePermissionOverrideInput {
  permission: string;
  granted: boolean;
}

const PERMISSION_SET = new Set<string>(PERMISSIONS);

/**
 * The matrix in `ROLE_PERMISSIONS` is the default, not the last word:
 * PLATFORM_ADMIN can grant a role a permission it would not otherwise have,
 * or revoke one it would. Overrides apply on top of the default every time -
 * there is no "reset to custom baseline", only "reset to default" (delete
 * the override row) or "change the default" (edit code and ship it). A
 * row for a permission that no longer exists, or a role that no longer
 * carries it in the matrix by name, is ignored rather than throwing - the
 * matrix is allowed to evolve without a stale override row breaking login.
 */
export function effectivePermissions(
  role: UserRole,
  overrides: readonly RolePermissionOverrideInput[],
): Permission[] {
  const result = new Set<Permission>(ROLE_PERMISSIONS[role]);
  for (const override of overrides) {
    if (!PERMISSION_SET.has(override.permission)) continue;
    const permission = override.permission as Permission;
    if (override.granted) {
      result.add(permission);
    } else {
      result.delete(permission);
    }
  }
  return [...result].sort();
}
