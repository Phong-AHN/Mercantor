'use server';

import { z } from 'zod';
import {
  ForbiddenError,
  renderAccountInviteEmail,
  USER_ROLE_TEAM,
  ValidationError,
  type UserRole,
} from '@relay/core';
import { randomToken } from '@relay/core/server';
import { createPasswordToken, hashPassword } from '@relay/auth';
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
    if (input.role === 'PLATFORM_ADMIN') {
      if (input.organizationId !== null) {
        throw new ValidationError('PLATFORM_ADMIN has no organization.', {
          organizationId: ['PLATFORM_ADMIN has no organization.'],
        });
      }
    } else if (input.organizationId === null) {
      throw new ValidationError('Choose an organization for this role.', {
        organizationId: ['Choose an organization for this role.'],
      });
    } else {
      const org = await db.organization.findUnique({
        where: { id: input.organizationId },
        select: { id: true },
      });
      if (!org) {
        throw new ValidationError('That organization no longer exists.', {
          organizationId: ['That organization no longer exists.'],
        });
      }
    }

    const user = await transaction((tx) =>
      createInvitedUser(tx, {
        email: input.email,
        name: input.name,
        role: input.role,
        title: input.title ?? null,
        organizationId: input.organizationId,
        invitedBy: ctx.principal,
        ip: ctx.ip,
        auditAction: 'platform.invite_user',
      }),
    );

    return deliverInviteEmail(user, ctx.principal.name);
  },
});
