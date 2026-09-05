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
  'audit:read',
  'settings:manage',
] as const;

export type Permission = (typeof PERMISSIONS)[number];
