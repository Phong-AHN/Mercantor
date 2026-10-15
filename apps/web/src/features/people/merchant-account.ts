import 'server-only';
import { ConflictError, ForbiddenError, ValidationError } from '@relay/core';
import { db } from '@relay/db';

/**
 * Rules for changing a merchant's login account, shared by the project's
 * Settings (`updateMerchantMemberAction`) and the People page
 * (`updateOrgMerchantAction`) so both refuse exactly the same things.
 *
 * A merchant account is not owned by one organization: it can be a member of
 * projects run by different agencies. Its email decides where password
 * resets go, so an organization changing an account that also reaches
 * another organization's project could take that access over. An edit is
 * only allowed while every project this account can open belongs to the
 * editing organization.
 */

export interface MerchantAccount {
  id: string;
  name: string;
  email: string;
}

/** A live merchant account with at least one project in this organization - else refused. */
export async function merchantInOrganization(
  organizationId: string,
  userId: string,
): Promise<MerchantAccount & { projectIds: string[] }> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      deletedAt: true,
      projectMemberships: {
        where: { project: { organizationId, deletedAt: null } },
        select: { projectId: true },
      },
    },
  });
  // One message for every miss, so an id from elsewhere tells the caller nothing.
  if (
    !user ||
    user.role !== 'MERCHANT' ||
    user.deletedAt !== null ||
    user.projectMemberships.length === 0
  ) {
    throw new ConflictError('That merchant is not on any of your projects.');
  }
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    projectIds: user.projectMemberships.map((membership) => membership.projectId),
  };
}

/** Refuses when the account also reaches a project of another organization. */
export async function assertMerchantOnlyIn(organizationId: string, userId: string): Promise<void> {
  const elsewhere = await db.projectMember.count({
    where: { userId, project: { organizationId: { not: organizationId } } },
  });
  if (elsewhere > 0) {
    throw new ForbiddenError(
      'This merchant account is shared with another organization, so it can only be changed by the people who manage it there.',
    );
  }
}

/** Refuses an email another account already signs in with. */
export async function assertEmailFree(email: string, userId: string): Promise<void> {
  const taken = await db.user.findFirst({
    where: { email, id: { not: userId } },
    select: { id: true },
  });
  if (taken) {
    throw new ValidationError('Another account already uses that email.', {
      email: ['Another account already uses that email.'],
    });
  }
}
