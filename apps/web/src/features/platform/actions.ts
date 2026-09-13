'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { ConflictError, ForbiddenError, USER_ROLES } from '@relay/core';
import { db, transaction } from '@relay/db';
import {
  createClickUpProvider,
  createResendProvider,
  createSlackProvider,
  setPlatformIntegration,
} from '@relay/integrations';
import { PERMISSIONS, ROLE_PERMISSIONS } from '@relay/rbac';
import { actionOk, defineAction } from '@/server/action';
import { audit } from '@/server/record';
import { OVERRIDABLE_ROLES } from './service';

/**
 * The shared fallback credentials, one shared account for every organization
 * that has not configured its own (`registry.ts`'s `PlatformIntegration`
 * tier). Same "verify live before saving" shape as
 * `setOrganizationIntegrationAction` - a typo'd token would otherwise sit
 * encrypted and silently broken.
 */
const configureInput = z.discriminatedUnion('provider', [
  z.object({
    provider: z.literal('SLACK'),
    botToken: z.string().trim().min(1, 'Paste the bot token.'),
  }),
  z.object({
    provider: z.literal('CLICKUP'),
    apiToken: z.string().trim().min(1, 'Paste the API token.'),
    teamId: z.string().trim().optional(),
  }),
  z.object({
    provider: z.literal('EMAIL'),
    apiKey: z.string().trim().min(1, 'Paste the Resend API key.'),
    from: z.string().trim().min(1, 'Set a from address.'),
  }),
]);

export const setPlatformIntegrationAction = defineAction({
  name: 'platform.configure_integration',
  permission: 'platform:manage',
  input: configureInput,
  async handler(input, ctx) {
    let config:
      | { botToken: string }
      | { apiToken: string; teamId?: string }
      | { apiKey: string; from: string };
    let health: { reachable: boolean; detail: string };

    if (input.provider === 'SLACK') {
      config = { botToken: input.botToken };
      health = await createSlackProvider(config.botToken).health();
    } else if (input.provider === 'CLICKUP') {
      config = { apiToken: input.apiToken, teamId: input.teamId || undefined };
      health = await createClickUpProvider(config.apiToken).health();
    } else {
      config = { apiKey: input.apiKey, from: input.from };
      health = await createResendProvider(config.apiKey, config.from).health();
    }

    if (!health.reachable) {
      throw new ConflictError(health.detail || 'Those credentials could not be verified.');
    }

    await setPlatformIntegration({
      provider: input.provider,
      config,
      updatedById: ctx.principal.id,
    });

    await transaction(async (tx) => {
      await audit(tx, {
        principal: ctx.principal,
        action: 'platform.configure_integration',
        entityType: 'PlatformIntegration',
        entityId: input.provider,
        after: { provider: input.provider },
        ip: ctx.ip,
      });
    });

    const label =
      input.provider === 'SLACK' ? 'Slack' : input.provider === 'CLICKUP' ? 'ClickUp' : 'Email';
    revalidatePath('/admin/platform');
    return actionOk(undefined, `${label} fallback credentials saved.`);
  },
});

export const clearPlatformIntegrationAction = defineAction({
  name: 'platform.disconnect_integration',
  permission: 'platform:manage',
  input: z.object({ provider: z.enum(['SLACK', 'CLICKUP', 'EMAIL']) }),
  async handler(input, ctx) {
    await setPlatformIntegration({
      provider: input.provider,
      config: null,
      updatedById: ctx.principal.id,
    });

    await transaction(async (tx) => {
      await audit(tx, {
        principal: ctx.principal,
        action: 'platform.disconnect_integration',
        entityType: 'PlatformIntegration',
        entityId: input.provider,
        before: { provider: input.provider },
        ip: ctx.ip,
      });
    });

    revalidatePath('/admin/platform');
    return actionOk(undefined, 'Cleared - organizations without their own credentials now fall to .env.');
  },
});

/**
 * Toggles one (role, permission) cell. `granted` is the new state the click
 * asked for; when it matches what `ROLE_PERMISSIONS` already says by
 * default, the override row is deleted rather than written - "back to
 * default" is a real state (no row), not a redundant one that happens to
 * agree with the code. PLATFORM_ADMIN is refused outright: it holds every
 * permission in code, unconditionally, and an override on that role could
 * lock every operator out of the screen that would undo it.
 */
export const setRolePermissionOverrideAction = defineAction({
  name: 'platform.set_role_permission',
  permission: 'platform:manage',
  input: z.object({
    role: z.enum(USER_ROLES),
    permission: z.enum(PERMISSIONS),
    granted: z.boolean(),
  }),
  async handler(input, ctx) {
    if (!OVERRIDABLE_ROLES.includes(input.role)) {
      throw new ForbiddenError('PLATFORM_ADMIN always holds every permission.');
    }

    const defaultGranted = ROLE_PERMISSIONS[input.role].includes(input.permission);
    const matchesDefault = input.granted === defaultGranted;

    if (matchesDefault) {
      await db.rolePermissionOverride.deleteMany({
        where: { role: input.role, permission: input.permission },
      });
    } else {
      await db.rolePermissionOverride.upsert({
        where: { role_permission: { role: input.role, permission: input.permission } },
        create: {
          role: input.role,
          permission: input.permission,
          granted: input.granted,
          updatedById: ctx.principal.id,
        },
        update: { granted: input.granted, updatedById: ctx.principal.id },
      });
    }

    await transaction(async (tx) => {
      await audit(tx, {
        principal: ctx.principal,
        action: 'platform.set_role_permission',
        entityType: 'RolePermissionOverride',
        entityId: `${input.role}:${input.permission}`,
        after: matchesDefault
          ? { reset: true }
          : { role: input.role, permission: input.permission, granted: input.granted },
        ip: ctx.ip,
      });
    });

    revalidatePath('/admin/platform');
    return actionOk(undefined, matchesDefault ? 'Reset to default.' : 'Saved.');
  },
});
