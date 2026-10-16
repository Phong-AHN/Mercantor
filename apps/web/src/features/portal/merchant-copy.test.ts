import { describe, expect, it } from 'vitest';
import { STAGES, type ProjectStage } from '@relay/core';
import {
  MERCHANT_MILESTONES,
  accessWaitingOnMerchant,
  assetWaitingOnMerchant,
  isMerchantFacingActivity,
  merchantMilestones,
  milestoneReachedAt,
  plainAccessItem,
  shownOnPortalAssets,
} from './merchant-copy';

describe('merchant milestones', () => {
  it('puts every stage on the track into exactly one milestone', () => {
    const linear = (Object.keys(STAGES) as ProjectStage[]).filter(
      (stage) => STAGES[stage].order !== null,
    );
    for (const stage of linear) {
      const owners = MERCHANT_MILESTONES.filter((milestone) => milestone.stages.includes(stage));
      expect(owners, stage).toHaveLength(1);
    }
  });

  it('marks earlier milestones done and later ones upcoming', () => {
    const progress = merchantMilestones('DEVELOPMENT', []);
    expect(progress.current.key).toBe('build');
    expect(progress.steps.map((step) => step.state)).toEqual([
      'done',
      'done',
      'current',
      'upcoming',
      'upcoming',
    ]);
  });

  it('shows an on-hold project at the furthest milestone it reached', () => {
    const progress = merchantMilestones('ON_HOLD_BLOCKED', [
      'INTRODUCTION',
      'WAITING_FOR_ACCESS',
      'MERCHANT_QA',
    ]);
    expect(progress.current.key).toBe('test');
  });

  it('marks everything done once the project is completed', () => {
    const progress = merchantMilestones('COMPLETED', []);
    expect(progress.steps.every((step) => step.state === 'done')).toBe(true);
  });

  it('dates each milestone by the first move into it', () => {
    const at = (day: number) => new Date(Date.UTC(2026, 9, day));
    const reached = milestoneReachedAt([
      { type: 'STAGE_CHANGED', occurredAt: at(9), payload: { to: 'DEVELOPMENT' } },
      { type: 'STAGE_CHANGED', occurredAt: at(5), payload: { to: 'MIGRATION' } },
      { type: 'STAGE_CHANGED', occurredAt: at(2), payload: { to: 'WAITING_FOR_ACCESS' } },
      { type: 'COMMENT_POSTED', occurredAt: at(1), payload: { to: 'COMPLETED' } },
      { type: 'STAGE_CHANGED', occurredAt: at(3), payload: null },
    ]);
    expect(reached.get('build')).toEqual(at(5));
    expect(reached.get('share')).toEqual(at(2));
    expect(reached.has('launch')).toBe(false);
  });
});

describe('what is waiting on the merchant', () => {
  it('counts access as waiting until the merchant has given it', () => {
    expect(accessWaitingOnMerchant({ status: 'REQUESTED' })).toBe(true);
    expect(accessWaitingOnMerchant({ status: 'ISSUE' })).toBe(true);
    expect(accessWaitingOnMerchant({ status: 'RECEIVED' })).toBe(false);
    expect(accessWaitingOnMerchant({ status: 'VERIFIED' })).toBe(false);
  });

  it('keeps the redirect list waiting until the merchant approves it', () => {
    const redirect = { kind: 'REDIRECT_MAP', required: true };
    expect(assetWaitingOnMerchant({ ...redirect, status: 'RECEIVED' })).toBe(true);
    expect(assetWaitingOnMerchant({ ...redirect, status: 'APPROVED' })).toBe(false);
  });

  it('stops counting a file once it is sent, and never counts hidden or optional ones', () => {
    expect(assetWaitingOnMerchant({ kind: 'LOGO', required: true, status: 'REQUESTED' })).toBe(
      true,
    );
    expect(assetWaitingOnMerchant({ kind: 'LOGO', required: true, status: 'RECEIVED' })).toBe(
      false,
    );
    expect(assetWaitingOnMerchant({ kind: 'LOGO', required: false, status: 'REQUESTED' })).toBe(
      false,
    );
    expect(
      assetWaitingOnMerchant({ kind: 'STORE_CREDENTIALS', required: true, status: 'REQUESTED' }),
    ).toBe(false);
    expect(shownOnPortalAssets({ kind: 'STORE_CREDENTIALS' })).toBe(false);
  });
});

describe('plain wording', () => {
  it('names known items in the merchant glossary and falls back to the label', () => {
    expect(plainAccessItem({ kind: 'DOMAIN_DNS', label: 'Domain / DNS', notes: null }).title).toBe(
      'Your web address settings',
    );
    expect(
      plainAccessItem({ kind: 'NOT_IN_THE_GLOSSARY', label: 'Klaviyo', notes: 'API key' }),
    ).toMatchObject({
      title: 'Klaviyo',
      help: 'API key',
    });
  });

  it('hides stage-by-stage moves from the merchant history', () => {
    expect(isMerchantFacingActivity({ type: 'STAGE_CHANGED' })).toBe(false);
    expect(isMerchantFacingActivity({ type: 'APPROVAL_DECIDED' })).toBe(true);
  });
});
