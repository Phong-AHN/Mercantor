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
  'invoice:read',
  'approval:read',
  'approval:decide_shopline',
  'handoff:decide',
  'introduction:send',
  'integration:read',
  'user:read',
];

export const ROLE_PERMISSIONS: Record<UserRole, readonly Permission[]> = {
  // Operates the portal itself. Full reach, and every action is audited.
  PLATFORM_ADMIN: [...PERMISSIONS],

  AHN_ADMIN: [
    ...AHN_DELIVERY,
    'project:create',
    'project:delete',
    'project:assign',
    'merchant:manage',
    'invoice:read',
    'invoice:manage',
    'bank_transaction:read',
    'bank_transaction:import',
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
    'bank_transaction:read',
    'bank_transaction:import',
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
  SHOPLINE_SOLUTIONS_ENGINEER: [
    ...SHOPLINE_BASE.filter((permission) => permission !== 'invoice:read'),
    'issue:manage',
  ],

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
