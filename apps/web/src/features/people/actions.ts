'use server';

import { z } from 'zod';
import { renderAccountInviteEmail, USER_ROLE_TEAM, ValidationError } from '@relay/core';
import { randomToken } from '@relay/core/server';
import { createPasswordToken, hashPassword } from '@relay/auth';
import { env } from '@relay/config';
import { db, transaction } from '@relay/db';
import { integrations } from '@relay/integrations';
import { logger } from '@relay/observability';
import { actionOk, defineAction } from '@/server/action';
import { audit } from '@/server/record';
import { INVITABLE_ROLES } from './roles';

/**
 * Creates the `User` row and emails a one-time set-password link - the gap
 * `FUTURE-WORK.md` §1 named first: every account before this existed only
 * because `pnpm db:seed` or a direct database write made it. The new row
 * gets a real `passwordHash`, just an unusable one (a hash of a random
 * value nobody was ever given) - sign-in is not possible for it until the
 * invite link is used, the same way an `INVITE`-purpose `PasswordToken`
 * already implies "this account exists but no session has ever come from
 * it."
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
    const email = input.email.trim().toLowerCase();
    const team = USER_ROLE_TEAM[input.role];

    const existing = await db.user.findFirst({
      where: { email },
      select: { id: true, deletedAt: true },
    });
    if (existing && existing.deletedAt === null) {
      throw new ValidationError('That email already has an account.', {
        email: ['That email already has an account.'],
      });
    }

    const placeholderHash = await hashPassword(randomToken(32));

    const user = await transaction(async (tx) => {
      const row = existing
        ? await tx.user.update({
            where: { id: existing.id },
            data: {
              deletedAt: null,
              isActive: true,
              name: input.name,
              role: input.role,
              team,
              title: input.title ?? null,
              passwordHash: placeholderHash,
            },
          })
        : await tx.user.create({
            data: {
              email,
              name: input.name,
              role: input.role,
              team,
              title: input.title ?? null,
              passwordHash: placeholderHash,
              isActive: true,
            },
          });

      await audit(tx, {
        principal: ctx.principal,
        action: 'people.invite',
        entityType: 'User',
        entityId: row.id,
        after: { email: row.email, role: row.role, team: row.team },
        ip: ctx.ip,
      });

      return row;
    });

    const { token } = await createPasswordToken(user.id, 'INVITE');
    const rendered = renderAccountInviteEmail({
      recipientName: user.name,
      invitedBy: ctx.principal.name,
      setPasswordUrl: `${env().APP_URL}/set-password?token=${token}`,
    });
    const result = await integrations().email.send({
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
  },
});
