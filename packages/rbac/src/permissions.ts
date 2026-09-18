/**
 * `resource:action`. Every enforcement point - server action, route handler,
 * worker, navigation - calls the same engine. The UI uses it to hide controls;
 * the server uses it to decide. A frontend check is never sufficient.
 */
export const PERMISSIONS = [
  // Portfolio & project record
  'portfolio:read',
  'project:read',
  'project:create',
  'project:update',
  'project:delete',
  'project:assign',
  'project:advance_stage',

  // Merchant directory
  'merchant:read',
  'merchant:manage',

  // Working surfaces
  'blocker:read',
  'blocker:manage',
  'scope:read',
  'scope:manage',
  'access:read',
  'access:manage',
  'access:provide',
  'asset:read',
  'asset:manage',
  'asset:upload',

  // Conversation
  'activity:read',
  'comment:read',
  'comment:create',
  'comment:manage',
  /** Read and write AHN-internal notes. The private-notes boundary. */
  'comment:internal',

  // Issues
  'issue:read',
  'issue:create',
  'issue:manage',

  // Money
  'invoice:read',
  'invoice:manage',

  // Formal checkpoints
  'approval:read',
  'approval:request',
  'approval:decide_internal',
  'approval:decide_merchant',
  'approval:decide_shopline',

  // Handoff
  'handoff:submit',
  'handoff:decide',

  // Communications
  'introduction:send',

  // Integrations & admin
  'integration:read',
  'integration:manage',
  'user:read',
  'user:manage',
  /** Soft-deletes a staff account (`removeOrgUserAction`) - separate from
   * `user:manage` (invite, edit role/title) so a role can hold one without
   * the other, e.g. via a `RolePermissionOverride`. */
  'user:remove',
  'audit:read',
  'settings:manage',

  /**
   * The portal-wide config screen: env-fallback integration credentials and
   * the role permission matrix itself. Deliberately separate from
   * `settings:manage` (an org's own aging thresholds and checklists,
   * held by AHN_ADMIN/SHOPLINE_ADMIN too) - this one reaches across every
   * tenant, so only PLATFORM_ADMIN ever holds it.
   */
  'platform:manage',
] as const;

export type Permission = (typeof PERMISSIONS)[number];
