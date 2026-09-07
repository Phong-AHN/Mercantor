import { describe, expect, it } from 'vitest';
import { buildSnapshot } from './snapshot';
import { buildProjectsCsv } from './csv';
import type { ProjectListItem } from './queries';

const NOW = new Date('2026-09-04T00:00:00.000Z');

function fixture(overrides: Partial<ProjectListItem> = {}): ProjectListItem {
  const startDate = new Date('2026-06-01T00:00:00.000Z');

  const snapshot = buildSnapshot({
    startDate,
    targetLaunchDate: new Date('2026-10-01T00:00:00.000Z'),
    completedAt: null,
    lastActivityAt: NOW,
    stage: 'DEVELOPMENT',
    stageEvents: [{ stage: 'DEVELOPMENT', enteredAt: startDate, exitedAt: null, ownerTeam: 'AHN' }],
    blockerOwnerships: [],
    openBlockers: [],
    issues: [],
    invoices: [
      {
        status: 'INVOICE_SENT',
        amountMinor: 500_000,
        paidMinor: 200_000,
        currency: 'USD',
        dueDate: null,
      },
    ],
    contractTotalMinor: 1_000_000,
    currency: 'USD',
    now: NOW,
  });

  return {
    id: 'project-1',
    code: 'PRJ-001',
    merchant: {
      id: 'merchant-1',
      name: 'Acme, Inc.',
      website: 'https://acme.example',
      storeId: 'store-1',
      platform: 'Shopify',
    },
    stage: 'DEVELOPMENT',
    migrationType: 'ONE_TO_ONE',
    startDate,
    targetLaunchDate: new Date('2026-10-01T00:00:00.000Z'),
    actualLaunchDate: null,
    completedAt: null,
    lastActivityAt: NOW,
    nextAction: 'Confirm DNS cutover',
    nextActionDueDate: new Date('2026-09-10T00:00:00.000Z'),
    nextActionOwner: { id: 'user-1', name: 'Jamie Lee', team: 'AHN', role: 'AHN_PROJECT_MANAGER' },
    nextActionOwnerTeam: null,
    contractTotalMinor: 1_000_000,
    people: {
      ahnPm: { id: 'user-1', name: 'Jamie Lee', team: 'AHN', role: 'AHN_PROJECT_MANAGER' },
      ahnDev: null,
      shoplineAm: null,
      shoplineSe: null,
    },
    blocker: null,
    approvals: {},
    snapshot,
    ...overrides,
  };
}

describe('buildProjectsCsv', () => {
  it('includes a header row and one data row per project', () => {
    const csv = buildProjectsCsv([fixture()], true);
    const lines = csv.trim().split('\r\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]!.split(',')[0]).toBe('Code');
    expect(lines[1]!.split(',')[0]).toBe('PRJ-001');
  });

  it('appends money columns only when showMoney is true, mirroring the invoice:read gate', () => {
    const withMoney = buildProjectsCsv([fixture()], true).trim().split('\r\n');
    const withoutMoney = buildProjectsCsv([fixture()], false).trim().split('\r\n');

    expect(withMoney[0]).toContain('Contract total');
    expect(withoutMoney[0]).not.toContain('Contract total');
    expect(withoutMoney[0]).not.toContain('Invoice status');

    // Money is minor units as a plain decimal, not a locale-formatted string.
    expect(withMoney[1]).toContain('10000.00'); // contractTotalMinor 1_000_000 -> 10000.00
  });

  it('quotes a field containing a comma and escapes an embedded quote', () => {
    const project = fixture({
      merchant: {
        id: 'merchant-2',
        name: 'Acme, "The Best" Inc.',
        website: null,
        storeId: null,
        platform: null,
      },
    });
    const csv = buildProjectsCsv([project], false);
    expect(csv).toContain('"Acme, ""The Best"" Inc."');
  });

  it('renders a project with no blocker, no next-action owner and no target launch date as empty cells, not "null"', () => {
    const project = fixture({
      nextAction: null,
      nextActionDueDate: null,
      nextActionOwner: null,
      nextActionOwnerTeam: null,
      targetLaunchDate: null,
      blocker: null,
    });
    const csv = buildProjectsCsv([project], false);
    expect(csv).not.toMatch(/null/i);
    expect(csv).not.toMatch(/undefined/i);
  });

  it('produces only a header row for an empty project list', () => {
    const csv = buildProjectsCsv([], true);
    expect(csv.trim().split('\r\n')).toHaveLength(1);
  });

  it('defuses a merchant name that looks like a spreadsheet formula (CWE-1236)', () => {
    const project = fixture({
      merchant: {
        id: 'merchant-3',
        name: '=cmd|calc.exe!A1',
        website: '+1-555-0100',
        storeId: '@mention',
        platform: null,
      },
      nextAction: '-5 days overdue',
    });
    const csv = buildProjectsCsv([project], false);
    const cells = csv.trim().split('\r\n')[1]!.split(',');

    // A leading ', not stripped, is exactly what tells Excel/Sheets/LibreOffice
    // to treat the rest as literal text rather than evaluate it as a formula.
    expect(cells).toContain("'=cmd|calc.exe!A1");
    expect(csv).toContain("'+1-555-0100");
    expect(csv).toContain("'@mention");
    expect(csv).toContain("'-5 days overdue");
  });

  it('never applies the formula defusal to an ordinary numeric column', () => {
    const csv = buildProjectsCsv([fixture()], true);
    const [, dataLine] = csv.trim().split('\r\n');
    // Age (days), Days in current stage, Open/launch-blocker counts, and every
    // money column are real numbers or formatted-from-a-number strings - none
    // of them should ever come out with the defusal prefix.
    expect(dataLine).not.toMatch(/,'\d/);
    expect(dataLine).toContain('10000.00');
  });
});
