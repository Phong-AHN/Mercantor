import {
  ForbiddenError,
  USER_ROLE_TEAM,
  type ApprovalType,
  type CommentVisibility,
  type Team,
  type UserRole,
} from '@relay/core';
import { ROLE_PERMISSIONS } from './matrix';
import type { Permission } from './permissions';

/**
 * Who is asking. Built on the server from the session and the database row -
 * never from a header, a token claim or a request body.
 */
export interface Principal {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  team: Team;
  isActive: boolean;
}

export function principalTeam(principal: Principal): Team {
  // The row carries a team, but the role is authoritative: a role change must
  // not leave a stale team behind.
  return USER_ROLE_TEAM[principal.role] ?? principal.team;
}

export function can(principal: Principal, permission: Permission): boolean {
  if (!principal.isActive) return false;
  return ROLE_PERMISSIONS[principal.role].includes(permission);
}

export function canAny(principal: Principal, permissions: readonly Permission[]): boolean {
  return permissions.some((permission) => can(principal, permission));
}

export function canAll(principal: Principal, permissions: readonly Permission[]): boolean {
  return permissions.every((permission) => can(principal, permission));
}

/** Throws a 403 rather than returning false. Used at every write entry point. */
export function assertCan(principal: Principal, permission: Permission, context = {}): void {
  if (!can(principal, permission)) {
    throw new ForbiddenError('You do not have permission to do that.', {
      permission,
      role: principal.role,
      userId: principal.id,
      ...context,
    });
  }
}

/**
 * Which comment and activity visibilities this principal may ever read.
 * Applied in the `where` clause, so private rows are not fetched rather than
 * fetched and hidden.
 */
export function readableVisibilities(principal: Principal): CommentVisibility[] {
  const team = principalTeam(principal);
  if (team === 'AHN' && can(principal, 'comment:internal')) {
    return ['INTERNAL_AHN', 'AHN_SHOPLINE', 'EVERYONE'];
  }
  if (team === 'MERCHANT') return ['EVERYONE'];
  return ['AHN_SHOPLINE', 'EVERYONE'];
}

/** Which visibilities this principal may write. */
export function writableVisibilities(principal: Principal): CommentVisibility[] {
  return readableVisibilities(principal);
}

/** Whether this principal may record a decision on this approval type. */
export function canDecideApproval(principal: Principal, type: ApprovalType): boolean {
  switch (type) {
    case 'DESIGN':
    case 'DEVELOPMENT':
    case 'QA':
      return can(principal, 'approval:decide_internal');
    case 'MERCHANT_FINAL':
      return can(principal, 'approval:decide_merchant');
    case 'SHOPLINE_DEPLOYMENT':
      return can(principal, 'approval:decide_shopline');
  }
}

/**
 * Project visibility. A merchant reaches exactly the projects they hold a
 * `ProjectMember` row for; everyone else sees the portfolio. Returned as a
 * Prisma `where` fragment so the restriction is part of the query, not a
 * filter applied after the rows have already been read.
 */
export function projectScopeWhere(principal: Principal): Record<string, unknown> {
  const base: Record<string, unknown> = { deletedAt: null };
  if (principalTeam(principal) === 'MERCHANT') {
    return { ...base, members: { some: { userId: principal.id } } };
  }
  return base;
}

/** True when this principal is confined to their own project records. */
export function isConfinedToOwnProjects(principal: Principal): boolean {
  return principalTeam(principal) === 'MERCHANT';
}
