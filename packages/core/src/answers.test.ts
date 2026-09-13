import { describe, expect, it } from 'vitest';
import { buildAnswers, type AnswerInput } from './answers';
import { computeProjectTime, DAY_MS } from './sla';

const START = new Date('2026-01-01T00:00:00.000Z');
const NOW = new Date(START.getTime() + 5 * DAY_MS);

function baseInput(): Omit<AnswerInput, 'invoice'> {
  return {
    stage: 'MIGRATION',
    time: computeProjectTime({
      startedAt: START,
      stageSegments: [{ stage: 'MIGRATION', enteredAt: START, exitedAt: null }],
      now: NOW,
    }),
    health: { health: 'ON_TRACK', reasons: [] },
    nextAction: null,
    nextActionOwnerName: null,
    nextActionOwnerTeam: null,
    nextActionDueDate: null,
    openBlocker: null,
    openIssues: [],
    approvals: {},
    projectHref: '/projects/ABC',
  };
}

/**
 * The "Has AHN been paid?" tile carries an exact outstanding balance -
 * exactly the commercial figure SHOPLINE lost `invoice:read` over. It must
 * only ever appear when the caller actually passed invoice data in, never
 * be built and then filtered back out downstream.
 */
describe('buildAnswers', () => {
  it('includes the "Has AHN been paid?" tile when invoice data is given', () => {
    const answers = buildAnswers({
      ...baseInput(),
      invoice: {
        status: 'PARTIALLY_PAID',
        totalMinor: 100_000,
        paidMinor: 40_000,
        outstandingMinor: 60_000,
        currency: 'USD',
        nextDueDate: null,
      },
    });

    const tile = answers.find((a) => a.id === 'ahn-paid');
    expect(tile).toBeDefined();
    expect(tile!.detail).toContain('600.00');
  });

  it('omits the tile entirely - not just its value - when invoice is absent', () => {
    const withoutInvoice = buildAnswers({ ...baseInput(), invoice: null });
    expect(withoutInvoice.find((a) => a.id === 'ahn-paid')).toBeUndefined();

    const withoutInvoiceField = buildAnswers(baseInput() as AnswerInput);
    expect(withoutInvoiceField.find((a) => a.id === 'ahn-paid')).toBeUndefined();

    // Every other answer still renders - only the money tile is gone.
    expect(withoutInvoice.length).toBeGreaterThan(0);
    expect(withoutInvoice.find((a) => a.id === 'where')).toBeDefined();
    expect(withoutInvoice.find((a) => a.id === 'shopline-ready')).toBeDefined();
  });
});
