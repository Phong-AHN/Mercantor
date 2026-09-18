'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import {
  clock,
  ConflictError,
  ForbiddenError,
  renderAccountInviteEmail,
  renderPasswordResetEmail,
  USER_ROLE_TEAM,
  ValidationError,
  type UserRole,
} from '@relay/core';
import { randomToken } from '@relay/core/server';
import { createPasswordToken, hashPassword, revokeAllSessionsForUser } from '@relay/auth';
import { env } from '@relay/config';
import { db, transaction, type DbTransaction } from '@relay/db';
import { integrationsFor } from '@relay/integrations';
import { logger } from '@relay/observability';
import type { Principal } from '@relay/rbac';
import type { ActionResult } from '@/server/action';
import { actionOk, defineAction } from '@/server/action';
import { audit } from '@/server/record';
import { INVITABLE_ROLES, PLATFORM_INVITABLE_ROLES } from './roles';

/**
 * The organization rule every platform-level write that sets a role has to
 * enforce: `PLATFORM_ADMIN` has none, ever; every other role needs a real,
 * still-existing one. Shared by `platformInviteUserAction` and
 * `platformUpdateUserAction` so the two cannot drift apart on this.
 */
async function resolveOrganizationForRole(
  role: UserRole,
  organizationId: string | null,
): Promise<string | null> {
  if (role === 'PLATFORM_ADMIN') {
    if (organizationId !== null) {
      throw new ValidationError('PLATFORM_ADMIN has no organization.', {
        organizationId: ['PLATFORM_ADMIN has no organization.'],
      });
    }
    return null;
  }

  if (organizationId === null) {
    throw new ValidationError('Choose an organization for this role.', {
      organizationId: ['Choose an organization for this role.'],
    });
  }

  const org = await db.organization.findUnique({ where: { id: organizationId }, select: { id: true } });
  if (!org) {
    throw new ValidationError('That organization no longer exists.', {
      organizationId: ['That organization no longer exists.'],
    });
  }
  return organizationId;
}

/**
 * Shared by `inviteUserAction` and `platformInviteUserAction`: create the
 * `User` row (or reactivate a soft-deleted one at the same email) with a
 * real but unusable `passwordHash` - a hash of a random value nobody was
 * ever given, so sign-in is not possible until the invite link is used -
 * then email a one-time set-password link. The two callers differ only in
 * how `organizationId` is decided (the inviter's own org, vs. one chosen
 * explicitly because the inviter has none of their own) and which
 * permission and role list gate the call.
 */
async function createInvitedUser(
  tx: DbTransaction,
  input: {
    email: string;
    name: string;
    role: UserRole;
    title: string | null;
    organizationId: string | null;
    invitedBy: Principal;
    ip: string | null;
    auditAction: string;
  },
) {
  const email = input.email.trim().toLowerCase();
  const team = USER_ROLE_TEAM[input.role];

  const existing = await tx.user.findFirst({
    where: { email },
    select: { id: true, deletedAt: true },
  });
  if (existing && existing.deletedAt === null) {
    throw new ValidationError('That email already has an account.', {
      email: ['That email already has an account.'],
    });
  }

  const placeholderHash = await hashPassword(randomToken(32));

  const row = existing
    ? await tx.user.update({
        where: { id: existing.id },
        data: {
          deletedAt: null,
          isActive: true,
          name: input.name,
          role: input.role,
          team,
          title: input.title,
          passwordHash: placeholderHash,
          organizationId: input.organizationId,
        },
      })
    : await tx.user.create({
        data: {
          email,
          name: input.name,
          role: input.role,
          team,
          title: input.title,
          passwordHash: placeholderHash,
          isActive: true,
          organizationId: input.organizationId,
        },
      });

  await audit(tx, {
    principal: input.invitedBy,
    action: input.auditAction,
    entityType: 'User',
    entityId: row.id,
    after: { email: row.email, role: row.role, team: row.team, organizationId: row.organizationId },
    ip: input.ip,
  });

  return row;
}

/**
 * Mints the set-password token and sends the invite email through whichever
 * registry `organizationId` resolves to - `integrationsFor` already falls
 * an organization-less caller's email through the platform-wide fallback,
 * then `.env`, before mocking (see that function's own comment), so this
 * still delivers for a `PLATFORM_ADMIN` invite with no organization at all.
 */
async function deliverInviteEmail(user: {
  id: string;
  name: string;
  email: string;
  organizationId: string | null;
}, invitedByName: string): Promise<ActionResult<undefined>> {
  const { token } = await createPasswordToken(user.id, 'INVITE');
  const rendered = renderAccountInviteEmail({
    recipientName: user.name,
    invitedBy: invitedByName,
    setPasswordUrl: `${env().APP_URL}/set-password?token=${token}`,
  });
  const registry = await integrationsFor(user.organizationId);
  const result = await registry.email.send({
    to: [{ name: user.name, email: user.email }],
    subject: rendered.subject,
    text: rendered.text,
    html: rendered.html,
  });

  if (!result.ok) {
    logger.error({ userId: user.id, error: result.error }, 'invite email failed to send');
    return actionOk(
      undefined,
      `${user.name}'s account was created, but the invite email could not be sent - check /integrations.`,
    );
  }

  return actionOk(undefined, `Invited ${user.name}.`);
}

/**
 * Creates the `User` row and emails a one-time set-password link - the gap
 * `FUTURE-WORK.md` §1 named first: every account before this existed only
 * because `pnpm db:seed` or a direct database write made it.
 */
export const inviteUserAction = defineAction({
  name: 'people.invite',
  permission: 'user:manage',
  input: z.object({
    email: z
      .string()
      .trim()
      .min(1, 'Enter an email address.')
      .email('Enter a valid email address.'),
    name: z.string().trim().min(1, 'Enter a name.').max(200),
    role: z.enum(INVITABLE_ROLES),
    title: z.string().trim().max(200).optional(),
  }),
  async handler(input, ctx) {
    if (!ctx.principal.organizationId) {
      throw new ForbiddenError('Platform admins manage organizations, not their staff.');
    }
    const organizationId = ctx.principal.organizationId;

    const user = await transaction((tx) =>
      createInvitedUser(tx, {
        email: input.email,
        name: input.name,
        role: input.role,
        title: input.title ?? null,
        organizationId,
        invitedBy: ctx.principal,
        ip: ctx.ip,
        auditAction: 'people.invite',
      }),
    );

    return deliverInviteEmail(user, ctx.principal.name);
  },
});

/**
 * The `/people` counterpart to `inviteUserAction`'s "create": edits an
 * existing member's role and title, scoped to the caller's own
 * organization - an `AHN_ADMIN`/`SHOPLINE_ADMIN` manages their own staff,
 * never another organization's, the same boundary `inviteUserAction`
 * already draws by inferring `organizationId` from the caller rather than
 * taking it as input. `MERCHANT` is refused for the same reason as the
 * platform version (project-scoped access, not a role to reassign), and so
 * is editing your own row - simpler than reasoning about whether a
 * self-demotion would leave the organization with no admin, since another
 * admin doing it is always safe regardless of how many there are.
 */
export const updateOrgUserRoleAction = defineAction({
  name: 'people.update_role',
  permission: 'user:manage',
  input: z.object({
    userId: z.string().uuid(),
    role: z.enum(INVITABLE_ROLES),
    title: z.string().trim().max(200).optional(),
  }),
  async handler(input, ctx) {
    if (!ctx.principal.organizationId) {
      throw new ForbiddenError('Platform admins manage organizations, not their staff.');
    }
    if (input.userId === ctx.principal.id) {
      throw new ForbiddenError('You cannot change your own role here.');
    }

    const target = await db.user.findUnique({
      where: { id: input.userId },
      select: { id: true, name: true, role: true, organizationId: true, deletedAt: true },
    });
    if (!target || target.deletedAt !== null) {
      throw new ConflictError('That account no longer exists.');
    }
    if (target.role === 'MERCHANT') {
      // Checked before the organization-match below: a merchant's own
      // `organizationId` is always null (it belongs to a project via
      // `ProjectMember`, never a tenant) - matching on organization first
      // would reject every merchant with the generic "not part of your
      // organization" message instead of this more specific, correct one.
      throw new ValidationError('Merchant accounts are managed from their project, not here.');
    }
    if (target.organizationId !== ctx.principal.organizationId) {
      // Same message for "doesn't exist" and "belongs to another organization" -
      // confirming which one it is would leak that a given account exists
      // somewhere else, the same tenant-isolation rule `resolveProject`
      // enforces for projects.
      throw new ConflictError('That account is not part of your organization.');
    }

    const team = USER_ROLE_TEAM[input.role];

    await transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: input.userId },
        data: { role: input.role, team, title: input.title ?? null },
      });

      await audit(tx, {
        principal: ctx.principal,
        action: 'people.update_role',
        entityType: 'User',
        entityId: updated.id,
        before: { role: target.role },
        after: { role: updated.role },
        ip: ctx.ip,
      });
    });

    revalidatePath('/people');
    return actionOk(undefined, `Updated ${target.name}.`);
  },
});

/**
 * The `/people` counterpart to `inviteUserAction`'s "create" from the other
 * direction: soft-deletes a member of the viewer's own organization, the
 * same `deletedAt` field `createInvitedUser` already knows how to reactivate
 * - re-inviting the same email brings them back, so this needs no separate
 * "restore" action. Also revokes every live session immediately
 * (`revokeAllSessionsForUser`), the same belt-and-suspenders
 * `platformSetUserActiveAction` uses, even though `resolveSession` already
 * refuses a `deletedAt`-set account on its own next lookup. Same org-scoping,
 * self-refusal and `MERCHANT`-refusal as `updateOrgUserRoleAction` - a
 * merchant's access is a project-scoped `ProjectMember` row, not a staff
 * account this page manages.
 */
export const removeOrgUserAction = defineAction({
  name: 'people.remove',
  permission: 'user:remove',
  input: z.object({ userId: z.string().uuid() }),
  async handler(input, ctx) {
    if (!ctx.principal.organizationId) {
      throw new ForbiddenError('Platform admins manage organizations, not their staff.');
    }
    if (input.userId === ctx.principal.id) {
      throw new ForbiddenError('You cannot remove your own account here.');
    }

    const target = await db.user.findUnique({
      where: { id: input.userId },
      select: { id: true, name: true, role: true, organizationId: true, deletedAt: true },
    });
    if (!target || target.deletedAt !== null) {
      throw new ConflictError('That account no longer exists.');
    }
    if (target.role === 'MERCHANT') {
      throw new ValidationError('Merchant accounts are managed from their project, not here.');
    }
    if (target.organizationId !== ctx.principal.organizationId) {
      throw new ConflictError('That account is not part of your organization.');
    }

    await transaction(async (tx) => {
      await tx.user.update({
        where: { id: input.userId },
        data: { deletedAt: clock.now(), isActive: false },
      });

      await audit(tx, {
        principal: ctx.principal,
        action: 'people.remove',
        entityType: 'User',
        entityId: target.id,
        before: { deletedAt: null },
        after: { deletedAt: clock.now() },
        ip: ctx.ip,
      });
    });

    await revokeAllSessionsForUser(input.userId);

    revalidatePath('/people');
    return actionOk(undefined, `Removed ${target.name}.`);
  },
});

/**
 * The `/admin/platform` counterpart: PLATFORM_ADMIN has no organization of
 * its own, so `organizationId` is chosen explicitly here instead of
 * inferred from the caller, and the role list additionally offers
 * `PLATFORM_ADMIN` itself - see `PLATFORM_INVITABLE_ROLES`'s own comment
 * for why that is safe only behind `platform:manage`.
 */
export const platformInviteUserAction = defineAction({
  name: 'platform.invite_user',
  permission: 'platform:manage',
  input: z.object({
    email: z
      .string()
      .trim()
      .min(1, 'Enter an email address.')
      .email('Enter a valid email address.'),
    name: z.string().trim().min(1, 'Enter a name.').max(200),
    role: z.enum(PLATFORM_INVITABLE_ROLES),
    title: z.string().trim().max(200).optional(),
    organizationId: z.string().uuid().nullable(),
  }),
  async handler(input, ctx) {
    const organizationId = await resolveOrganizationForRole(input.role, input.organizationId);

    const user = await transaction((tx) =>
      createInvitedUser(tx, {
        email: input.email,
        name: input.name,
        role: input.role,
        title: input.title ?? null,
        organizationId,
        invitedBy: ctx.principal,
        ip: ctx.ip,
        auditAction: 'platform.invite_user',
      }),
    );

    return deliverInviteEmail(user, ctx.principal.name);
  },
});

/**
 * Edits an existing account's role, organization and title - the "manage"
 * half of platform-wide account administration, `platformInviteUserAction`
 * being the "create" half. `MERCHANT` accounts are excluded: a merchant's
 * access comes from `ProjectMember` rows on specific projects, not a role
 * change, and converting one to staff (or the reverse) is not a thing this
 * form should paper over. Editing your own row is refused outright - simpler
 * than reasoning about whether a self-demotion would leave zero
 * `PLATFORM_ADMIN`s standing, since another admin doing it is always safe
 * regardless of how many there are.
 */
export const platformUpdateUserAction = defineAction({
  name: 'platform.update_user',
  permission: 'platform:manage',
  input: z.object({
    userId: z.string().uuid(),
    role: z.enum(PLATFORM_INVITABLE_ROLES),
    organizationId: z.string().uuid().nullable(),
    title: z.string().trim().max(200).optional(),
  }),
  async handler(input, ctx) {
    if (input.userId === ctx.principal.id) {
      throw new ForbiddenError('You cannot change your own role here.');
    }

    const target = await db.user.findUnique({
      where: { id: input.userId },
      select: { id: true, name: true, role: true, organizationId: true, deletedAt: true },
    });
    if (!target || target.deletedAt !== null) {
      throw new ConflictError('That account no longer exists.');
    }
    if (target.role === 'MERCHANT') {
      throw new ValidationError('Merchant accounts are managed from their project, not here.');
    }

    const organizationId = await resolveOrganizationForRole(input.role, input.organizationId);
    const team = USER_ROLE_TEAM[input.role];

    await transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: input.userId },
        data: { role: input.role, team, organizationId, title: input.title ?? null },
      });

      await audit(tx, {
        principal: ctx.principal,
        action: 'platform.update_user',
        entityType: 'User',
        entityId: updated.id,
        before: { role: target.role, organizationId: target.organizationId },
        after: { role: updated.role, organizationId: updated.organizationId },
        ip: ctx.ip,
      });
    });

    revalidatePath('/admin/platform/people');
    return actionOk(undefined, `Updated ${target.name}.`);
  },
});

/**
 * Suspends or restores sign-in, without touching the row otherwise -
 * `resolveSession` already refuses an inactive account on every request, so
 * this is immediate, not "at next sign-out." Deactivating also revokes every
 * existing session (`revokeAllSessionsForUser`), the same as a password
 * change - an account someone just locked should not keep working from a
 * tab that was already open. Refused on your own account for the same
 * reason `platformUpdateUserAction` refuses a self role change: another
 * `PLATFORM_ADMIN` doing it is always safe, doing it to yourself risks
 * locking yourself out with nobody at the keyboard to undo it.
 */
export const platformSetUserActiveAction = defineAction({
  name: 'platform.set_user_active',
  permission: 'platform:manage',
  input: z.object({ userId: z.string().uuid(), isActive: z.boolean() }),
  async handler(input, ctx) {
    if (input.userId === ctx.principal.id) {
      throw new ForbiddenError('You cannot deactivate your own account.');
    }

    const target = await db.user.findUnique({
      where: { id: input.userId },
      select: { id: true, name: true, isActive: true, deletedAt: true },
    });
    if (!target || target.deletedAt !== null) {
      throw new ConflictError('That account no longer exists.');
    }
    if (target.isActive === input.isActive) {
      return actionOk(undefined, `${target.name} is already ${input.isActive ? 'active' : 'deactivated'}.`);
    }

    await transaction(async (tx) => {
      await tx.user.update({ where: { id: input.userId }, data: { isActive: input.isActive } });

      await audit(tx, {
        principal: ctx.principal,
        action: 'platform.set_user_active',
        entityType: 'User',
        entityId: input.userId,
        before: { isActive: target.isActive },
        after: { isActive: input.isActive },
        ip: ctx.ip,
      });
    });

    if (!input.isActive) {
      await revokeAllSessionsForUser(input.userId);
    }

    revalidatePath('/admin/platform/people');
    return actionOk(undefined, `${target.name} ${input.isActive ? 'reactivated' : 'deactivated'}.`);
  },
});

/**
 * Mints a fresh link and re-sends it: `INVITE` for an account that has never
 * signed in (the original link may be lost, expired, or never arrived),
 * `RESET` for one that has - the same two purposes and templates
 * `requestPasswordResetAction` uses for the self-service "forgot password"
 * flow, just triggered by an admin instead of the account holder. Consuming
 * either kind still only ever goes through the one `/set-password` page.
 */
export const platformResendInviteAction = defineAction({
  name: 'platform.resend_invite',
  permission: 'platform:manage',
  input: z.object({ userId: z.string().uuid() }),
  async handler(input, ctx) {
    const user = await db.user.findUnique({
      where: { id: input.userId },
      select: {
        id: true,
        name: true,
        email: true,
        organizationId: true,
        isActive: true,
        deletedAt: true,
        lastLoginAt: true,
      },
    });
    if (!user || user.deletedAt !== null) {
      throw new ConflictError('That account no longer exists.');
    }
    if (!user.isActive) {
      throw new ConflictError('Reactivate the account before sending a link.');
    }

    const everSignedIn = user.lastLoginAt !== null;
    const { token } = await createPasswordToken(user.id, everSignedIn ? 'RESET' : 'INVITE');
    const rendered = everSignedIn
      ? renderPasswordResetEmail({
          recipientName: user.name,
          resetUrl: `${env().APP_URL}/set-password?token=${token}`,
        })
      : renderAccountInviteEmail({
          recipientName: user.name,
          invitedBy: ctx.principal.name,
          setPasswordUrl: `${env().APP_URL}/set-password?token=${token}`,
        });

    const registry = await integrationsFor(user.organizationId);
    const result = await registry.email.send({
      to: [{ name: user.name, email: user.email }],
      subject: rendered.subject,
      text: rendered.text,
      html: rendered.html,
    });

    if (!result.ok) {
      logger.error({ userId: user.id, error: result.error }, 'resend link email failed to send');
      return actionOk(undefined, `Link created, but the email could not be sent - check /integrations.`);
    }

    return actionOk(undefined, `Sent ${user.name} a new ${everSignedIn ? 'reset' : 'invite'} link.`);
  },
});
