import {
  AGING_BAND_LABEL,
  HEALTH_LABEL,
  INVOICE_STATUS_LABEL,
  MIGRATION_TYPE_LABEL,
  STAGES,
  TEAM_LABEL,
} from '@relay/core';
import type { ProjectListItem } from './queries';

/**
 * Portfolio export. Reuses `ProjectListItem` exactly as the table renders it
 * - the same filtered, scoped list a person is already looking at, not a
 * separate reporting query that could drift from what the screen shows.
 * `showMoney` mirrors the table's own gate (`invoice:read`): a role that
 * cannot see money in the UI cannot get it in the file either.
 */
export function buildProjectsCsv(projects: readonly ProjectListItem[], showMoney: boolean): string {
  const headers = [
    'Code',
    'Merchant',
    'Website',
    'SHOPLINE store ID',
    'Current platform',
    'Migration type',
    'Stage',
    'Health',
    'Health reasons',
    'Ageing band',
    'Age (days)',
    'Days in current stage',
    'Blocked on',
    'Blocker owner',
    'Blocker age (days)',
    'Open issues',
    'Launch-blocking issues',
    'Next action',
    'Next action owner',
    'Next action due',
    'AHN project manager',
    'AHN developer',
    'SHOPLINE account manager',
    'SHOPLINE solutions engineer',
    'Start date',
    'Target launch date',
    'Last activity',
    ...(showMoney
      ? ['Contract total', 'Invoiced', 'Paid', 'Outstanding', 'Currency', 'Invoice status']
      : []),
  ];

  const rows = projects.map((project) => {
    const row: (string | number)[] = [
      project.code,
      project.merchant.name,
      project.merchant.website ?? '',
      project.merchant.storeId ?? '',
      project.merchant.platform ?? '',
      MIGRATION_TYPE_LABEL[project.migrationType].label,
      STAGES[project.stage].label,
      HEALTH_LABEL[project.snapshot.health.health].label,
      project.snapshot.health.reasons.join('; '),
      AGING_BAND_LABEL[project.snapshot.time.agingBand].label,
      Math.round(project.snapshot.time.ageMs / 86_400_000),
      Math.round(project.snapshot.time.currentStageMs / 86_400_000),
      project.blocker?.title ?? '',
      project.blocker ? TEAM_LABEL[project.blocker.ownerTeam].label : '',
      project.blocker
        ? Math.round((Date.now() - project.blocker.startedAt.getTime()) / 86_400_000)
        : '',
      project.snapshot.openIssueCount,
      project.snapshot.launchBlockerCount,
      project.nextAction ?? '',
      project.nextActionOwner?.name ??
        (project.nextActionOwnerTeam ? TEAM_LABEL[project.nextActionOwnerTeam].label : ''),
      isoDate(project.nextActionDueDate),
      project.people.ahnPm?.name ?? '',
      project.people.ahnDev?.name ?? '',
      project.people.shoplineAm?.name ?? '',
      project.people.shoplineSe?.name ?? '',
      isoDate(project.startDate),
      isoDate(project.targetLaunchDate),
      isoDate(project.lastActivityAt),
    ];

    if (showMoney) {
      row.push(
        minorToDecimal(project.contractTotalMinor),
        minorToDecimal(project.snapshot.invoice.invoicedMinor),
        minorToDecimal(project.snapshot.invoice.paidMinor),
        minorToDecimal(project.snapshot.invoice.outstandingMinor),
        project.snapshot.invoice.currency,
        INVOICE_STATUS_LABEL[project.snapshot.invoice.status].label,
      );
    }

    return row;
  });

  return [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

function isoDate(date: Date | null): string {
  return date ? date.toISOString().slice(0, 10) : '';
}

/** Minor units to a plain decimal string - a formula cell can sum it directly. */
function minorToDecimal(minor: number): string {
  return (minor / 100).toFixed(2);
}

/** Quotes a field only when it needs it, and escapes an embedded quote by doubling it. */
function csvCell(value: string | number): string {
  const text = String(value);
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}
