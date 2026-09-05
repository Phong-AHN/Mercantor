import { PROJECT_STAGES, type ProjectStage, type Team } from './enums';

/**
 * The eighteen stages, with the two facts the product keeps asking of them:
 * who we are waiting on while a project sits here, and how long that is
 * supposed to take. Both drive the SLA maths and the "who owns the delay"
 * answer, so they live in one table rather than being restated per screen.
 */
export interface StageDescriptor {
  readonly stage: ProjectStage;
  /** Position on the linear track. `null` for the two off-track stages. */
  readonly order: number | null;
  readonly label: string;
  /** Fits in a table cell and a pill. */
  readonly shortLabel: string;
  readonly phase: StagePhase;
  /** Who the clock is running against while a project sits in this stage. */
  readonly ownerTeam: Team;
  /** Target dwell time. Exceeding it makes a project AT_RISK. */
  readonly targetDays: number | null;
  readonly description: string;
  readonly isTerminal: boolean;
  /** ON_HOLD_BLOCKED stops the linear track without ending the project. */
  readonly isPaused: boolean;
}

export const STAGE_PHASES = ['ONBOARDING', 'BUILD', 'REVIEW', 'LAUNCH', 'OFF_TRACK'] as const;
export type StagePhase = (typeof STAGE_PHASES)[number];

export const STAGE_PHASE_LABEL: Record<StagePhase, string> = {
  ONBOARDING: 'Onboarding',
  BUILD: 'Build',
  REVIEW: 'Review',
  LAUNCH: 'Launch',
  OFF_TRACK: 'Off track',
};

export const STAGES: Record<ProjectStage, StageDescriptor> = {
  INTRODUCTION: {
    stage: 'INTRODUCTION',
    order: 1,
    label: 'Introduction',
    shortLabel: 'Intro',
    phase: 'ONBOARDING',
    ownerTeam: 'SHOPLINE',
    targetDays: 2,
    description: 'Project record created. SHOPLINE has not yet introduced the merchant to AHN.',
    isTerminal: false,
    isPaused: false,
  },
  MERCHANT_CONTACTED: {
    stage: 'MERCHANT_CONTACTED',
    order: 2,
    label: 'Merchant Contacted',
    shortLabel: 'Contacted',
    phase: 'ONBOARDING',
    ownerTeam: 'MERCHANT',
    targetDays: 3,
    description: 'Introduction email sent. Waiting for the merchant to reply.',
    isTerminal: false,
    isPaused: false,
  },
  KICKOFF_SCHEDULED: {
    stage: 'KICKOFF_SCHEDULED',
    order: 3,
    label: 'Kickoff Scheduled',
    shortLabel: 'Kickoff',
    phase: 'ONBOARDING',
    ownerTeam: 'AHN',
    targetDays: 5,
    description: 'Kickoff call is on the calendar. AHN runs it and captures requirements.',
    isTerminal: false,
    isPaused: false,
  },
  WAITING_FOR_ACCESS: {
    stage: 'WAITING_FOR_ACCESS',
    order: 4,
    label: 'Waiting for Access',
    shortLabel: 'Access',
    phase: 'ONBOARDING',
    ownerTeam: 'MERCHANT',
    targetDays: 5,
    description: 'Blocked on store, platform, domain or app credentials from the merchant.',
    isTerminal: false,
    isPaused: false,
  },
  ASSETS_COLLECTION: {
    stage: 'ASSETS_COLLECTION',
    order: 5,
    label: 'Assets / Requirements Collection',
    shortLabel: 'Assets',
    phase: 'ONBOARDING',
    ownerTeam: 'MERCHANT',
    targetDays: 7,
    description: 'Brand assets, product data, policies and the redirect map are being gathered.',
    isTerminal: false,
    isPaused: false,
  },
  MIGRATION: {
    stage: 'MIGRATION',
    order: 6,
    label: 'Migration',
    shortLabel: 'Migration',
    phase: 'BUILD',
    ownerTeam: 'AHN',
    targetDays: 7,
    description: 'Data migration in progress: products, customers, orders, pages, redirects.',
    isTerminal: false,
    isPaused: false,
  },
  DESIGN: {
    stage: 'DESIGN',
    order: 7,
    label: 'Design',
    shortLabel: 'Design',
    phase: 'BUILD',
    ownerTeam: 'AHN',
    targetDays: 7,
    description: 'Theme and page design being produced by AHN.',
    isTerminal: false,
    isPaused: false,
  },
  MERCHANT_DESIGN_REVIEW: {
    stage: 'MERCHANT_DESIGN_REVIEW',
    order: 8,
    label: 'Merchant Design Review',
    shortLabel: 'Design review',
    phase: 'REVIEW',
    ownerTeam: 'MERCHANT',
    targetDays: 5,
    description: 'Design handed to the merchant. Waiting for approval or change requests.',
    isTerminal: false,
    isPaused: false,
  },
  DEVELOPMENT: {
    stage: 'DEVELOPMENT',
    order: 9,
    label: 'Development',
    shortLabel: 'Dev',
    phase: 'BUILD',
    ownerTeam: 'AHN',
    targetDays: 10,
    description: 'Approved design being built, plus any custom scope.',
    isTerminal: false,
    isPaused: false,
  },
  INTERNAL_QA: {
    stage: 'INTERNAL_QA',
    order: 10,
    label: 'Internal QA',
    shortLabel: 'Internal QA',
    phase: 'REVIEW',
    ownerTeam: 'AHN',
    targetDays: 3,
    description: 'AHN quality pass before the merchant ever sees the build.',
    isTerminal: false,
    isPaused: false,
  },
  MERCHANT_QA: {
    stage: 'MERCHANT_QA',
    order: 11,
    label: 'Merchant QA',
    shortLabel: 'Merchant QA',
    phase: 'REVIEW',
    ownerTeam: 'MERCHANT',
    targetDays: 5,
    description: 'Merchant is testing the build and logging issues.',
    isTerminal: false,
    isPaused: false,
  },
  MIGRATION_VALIDATION: {
    stage: 'MIGRATION_VALIDATION',
    order: 12,
    label: 'Migration Validation',
    shortLabel: 'Validation',
    phase: 'REVIEW',
    ownerTeam: 'AHN',
    targetDays: 3,
    description: 'Record counts, redirects and data integrity verified against the source store.',
    isTerminal: false,
    isPaused: false,
  },
  READY_FOR_SHOPLINE_REVIEW: {
    stage: 'READY_FOR_SHOPLINE_REVIEW',
    order: 13,
    label: 'Ready for SHOPLINE Review',
    shortLabel: 'Ready for review',
    phase: 'LAUNCH',
    ownerTeam: 'AHN',
    targetDays: 1,
    description: 'AHN has submitted the handoff package. Awaiting SHOPLINE pickup.',
    isTerminal: false,
    isPaused: false,
  },
  SHOPLINE_REVIEW: {
    stage: 'SHOPLINE_REVIEW',
    order: 14,
    label: 'SHOPLINE Review',
    shortLabel: 'SL review',
    phase: 'LAUNCH',
    ownerTeam: 'SHOPLINE',
    targetDays: 3,
    description: 'SHOPLINE is reviewing the store before deployment.',
    isTerminal: false,
    isPaused: false,
  },
  READY_FOR_DEPLOYMENT: {
    stage: 'READY_FOR_DEPLOYMENT',
    order: 15,
    label: 'Ready for Deployment',
    shortLabel: 'Ready to deploy',
    phase: 'LAUNCH',
    ownerTeam: 'SHOPLINE',
    targetDays: 2,
    description: 'Deployment approved. Waiting on the launch window.',
    isTerminal: false,
    isPaused: false,
  },
  DEPLOYED_LIVE: {
    stage: 'DEPLOYED_LIVE',
    order: 16,
    label: 'Deployed / Live',
    shortLabel: 'Live',
    phase: 'LAUNCH',
    ownerTeam: 'AHN',
    targetDays: 5,
    description: 'Store is live. Post-launch watch period before closing the project.',
    isTerminal: false,
    isPaused: false,
  },
  COMPLETED: {
    stage: 'COMPLETED',
    order: 17,
    label: 'Completed',
    shortLabel: 'Completed',
    phase: 'LAUNCH',
    ownerTeam: 'OTHER',
    targetDays: null,
    description: 'Closed out. The clock has stopped.',
    isTerminal: true,
    isPaused: false,
  },
  ON_HOLD_BLOCKED: {
    stage: 'ON_HOLD_BLOCKED',
    order: null,
    label: 'On Hold / Blocked',
    shortLabel: 'On hold',
    phase: 'OFF_TRACK',
    ownerTeam: 'OTHER',
    targetDays: null,
    description: 'Paused. The open blocker decides who owns the elapsed time.',
    isTerminal: false,
    isPaused: true,
  },
};

/** The linear track, in order, excluding the paused stage. */
export const LINEAR_STAGES: readonly ProjectStage[] = PROJECT_STAGES.filter(
  (stage) => STAGES[stage].order !== null,
).sort((a, b) => (STAGES[a].order ?? 0) - (STAGES[b].order ?? 0));

export function stageDescriptor(stage: ProjectStage): StageDescriptor {
  return STAGES[stage];
}

export function stageLabel(stage: ProjectStage): string {
  return STAGES[stage].label;
}

/** 0..1 progress along the linear track. `ON_HOLD_BLOCKED` reports 0. */
export function stageProgress(stage: ProjectStage): number {
  const order = STAGES[stage].order;
  if (order === null) return 0;
  return order / LINEAR_STAGES.length;
}

export interface TransitionCheck {
  readonly allowed: boolean;
  /** Present when the move is legal but the caller must supply a reason. */
  readonly requiresReason: boolean;
  readonly reason?: string;
}

/**
 * The state machine. Deliberately permissive forwards and backwards - real
 * migrations loop back to design and development constantly - but strict about
 * the three transitions that mean something contractual:
 *
 *   - `COMPLETED` is only reachable from `DEPLOYED_LIVE`
 *   - `DEPLOYED_LIVE` is only reachable from `READY_FOR_DEPLOYMENT`
 *   - nothing leaves `COMPLETED`
 *
 * Anything moving backwards demands a written reason, because that is the
 * event the portfolio dashboard is trying to explain.
 */
export function checkTransition(from: ProjectStage, to: ProjectStage): TransitionCheck {
  if (from === to) {
    return {
      allowed: false,
      requiresReason: false,
      reason: 'The project is already at this stage.',
    };
  }
  if (from === 'COMPLETED') {
    return {
      allowed: false,
      requiresReason: false,
      reason: 'A completed project cannot be reopened. Create a follow-up project instead.',
    };
  }
  if (to === 'ON_HOLD_BLOCKED') {
    return { allowed: true, requiresReason: true };
  }
  if (from === 'ON_HOLD_BLOCKED') {
    return { allowed: true, requiresReason: false };
  }
  if (to === 'COMPLETED' && from !== 'DEPLOYED_LIVE') {
    return {
      allowed: false,
      requiresReason: false,
      reason: 'Only a live store can be marked completed.',
    };
  }
  if (to === 'DEPLOYED_LIVE' && from !== 'READY_FOR_DEPLOYMENT') {
    return {
      allowed: false,
      requiresReason: false,
      reason: 'Deployment must be approved first - move to Ready for Deployment.',
    };
  }

  const fromOrder = STAGES[from].order ?? 0;
  const toOrder = STAGES[to].order ?? 0;
  return { allowed: true, requiresReason: toOrder < fromOrder };
}

/** Every stage this project could legally move to right now. */
export function allowedTransitions(from: ProjectStage): ProjectStage[] {
  return PROJECT_STAGES.filter((to) => checkTransition(from, to).allowed);
}

/** The stage that normally follows, used by the primary "Advance" action. */
export function nextLinearStage(from: ProjectStage): ProjectStage | null {
  const order = STAGES[from].order;
  if (order === null) return null;
  const next = LINEAR_STAGES[order];
  return next ?? null;
}
