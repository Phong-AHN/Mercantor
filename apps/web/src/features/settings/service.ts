import 'server-only';
import {
  DEFAULT_AGING_THRESHOLDS,
  DEFAULT_INACTIVITY_DAYS,
  type AgingThresholds,
} from '@relay/core';
import { db } from '@relay/db';

/**
 * Portal-wide configuration. The ageing bands are the numbers the brief calls
 * "configurable", so they live in a table rather than a constant - retuning
 * them is a form, not a deploy.
 */
export const AGING_KEY = 'aging-thresholds';
export const INACTIVITY_KEY = 'inactivity-days';

export interface PortalSettings {
  aging: AgingThresholds;
  inactivityDays: number;
}

export async function getPortalSettings(): Promise<PortalSettings> {
  const rows = await db.portalSetting.findMany({
    where: { key: { in: [AGING_KEY, INACTIVITY_KEY] } },
  });

  const aging = rows.find((row) => row.key === AGING_KEY)?.value as
    Partial<AgingThresholds> | undefined;
  const inactivity = rows.find((row) => row.key === INACTIVITY_KEY)?.value as
    { days?: number } | undefined;

  return {
    aging: {
      attentionDays: aging?.attentionDays ?? DEFAULT_AGING_THRESHOLDS.attentionDays,
      delayedDays: aging?.delayedDays ?? DEFAULT_AGING_THRESHOLDS.delayedDays,
      criticalDays: aging?.criticalDays ?? DEFAULT_AGING_THRESHOLDS.criticalDays,
    },
    inactivityDays: inactivity?.days ?? DEFAULT_INACTIVITY_DAYS,
  };
}
