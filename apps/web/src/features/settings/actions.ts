'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { ValidationError } from '@relay/core';
import { db, transaction } from '@relay/db';
import { actionOk, defineAction } from '@/server/action';
import { audit } from '@/server/record';
import { AGING_KEY, INACTIVITY_KEY } from './service';

export const updateAgingThresholdsAction = defineAction({
  name: 'settings.update_aging',
  permission: 'settings:manage',
  input: z.object({
    attentionDays: z.coerce.number().int().min(1).max(365),
    delayedDays: z.coerce.number().int().min(1).max(365),
    criticalDays: z.coerce.number().int().min(1).max(730),
    inactivityDays: z.coerce.number().int().min(1).max(90),
  }),
  async handler(input, ctx) {
    // The bands are a ladder; letting them cross would make the labels lie.
    if (!(input.attentionDays < input.delayedDays && input.delayedDays < input.criticalDays)) {
      throw new ValidationError('The bands have to increase.', {
        delayedDays: ['Attention must come before Delayed, and Delayed before Critical.'],
      });
    }

    await transaction(async (tx) => {
      const before = await tx.portalSetting.findMany({
        where: { key: { in: [AGING_KEY, INACTIVITY_KEY] } },
      });

      await tx.portalSetting.upsert({
        where: { key: AGING_KEY },
        create: {
          key: AGING_KEY,
          value: {
            attentionDays: input.attentionDays,
            delayedDays: input.delayedDays,
            criticalDays: input.criticalDays,
          },
        },
        update: {
          value: {
            attentionDays: input.attentionDays,
            delayedDays: input.delayedDays,
            criticalDays: input.criticalDays,
          },
        },
      });

      await tx.portalSetting.upsert({
        where: { key: INACTIVITY_KEY },
        create: { key: INACTIVITY_KEY, value: { days: input.inactivityDays } },
        update: { value: { days: input.inactivityDays } },
      });

      await audit(tx, {
        principal: ctx.principal,
        action: 'settings.update_aging',
        entityType: 'PortalSetting',
        entityId: AGING_KEY,
        before: before.map((row) => ({ key: row.key, value: row.value })),
        after: input,
        ip: ctx.ip,
      });
    });

    revalidatePath('/settings');
    revalidatePath('/dashboard');
    return actionOk(undefined, 'Thresholds updated.');
  },
});

/** Counts how many projects each band would hold, for the preview. */
export const previewAgingAction = defineAction({
  name: 'settings.preview_aging',
  permission: 'settings:manage',
  input: z.object({}),
  async handler() {
    const projects = await db.project.findMany({
      where: { deletedAt: null, stage: { not: 'COMPLETED' } },
      select: { startDate: true },
    });
    return actionOk(projects.map((project) => project.startDate.toISOString()));
  },
});
