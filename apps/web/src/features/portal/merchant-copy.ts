import {
  STAGES,
  type AccessStatus,
  type ActivityType,
  type AssetStatus,
  type ProjectStage,
} from '@relay/core';

/**
 * Everything the merchant portal says in the merchant's words rather than
 * the team's: the five milestones that stand in for 17 internal stages, a
 * plain name and explanation for every checklist item, and the one rule for
 * "what is waiting on you" - shared so the Overview, Access and Assets pages
 * can never count or name the same thing differently.
 *
 * Copy follows the plain-language glossary in the Merchant Customer Journey
 * (section 7): no DNS, credentials, CSV, URL or sitemap in front of a merchant.
 */

// --- Milestones -------------------------------------------------------------

export interface MerchantMilestone {
  key: string;
  label: string;
  description: string;
  stages: readonly ProjectStage[];
}

/** In stage order; every linear stage belongs to exactly one milestone. */
export const MERCHANT_MILESTONES: readonly MerchantMilestone[] = [
  {
    key: 'start',
    label: 'Getting started',
    description: 'Meeting your team and agreeing what moves.',
    stages: ['INTRODUCTION', 'MERCHANT_CONTACTED', 'KICKOFF_SCHEDULED'],
  },
  {
    key: 'share',
    label: 'Sharing your details',
    description: 'You give us access and your files.',
    stages: ['WAITING_FOR_ACCESS', 'ASSETS_COLLECTION'],
  },
  {
    key: 'build',
    label: 'Building your store',
    description: 'We move your data, design the store and build it.',
    stages: ['MIGRATION', 'DESIGN', 'MERCHANT_DESIGN_REVIEW', 'DEVELOPMENT', 'INTERNAL_QA'],
  },
  {
    key: 'test',
    label: 'Review and test',
    description: 'You try the new store and tell us what to fix.',
    stages: ['MERCHANT_QA', 'MIGRATION_VALIDATION'],
  },
  {
    key: 'launch',
    label: 'Launch',
    description: 'SHOPLINE checks it and your new store goes live.',
    stages: [
      'READY_FOR_SHOPLINE_REVIEW',
      'SHOPLINE_REVIEW',
      'READY_FOR_DEPLOYMENT',
      'DEPLOYED_LIVE',
      'COMPLETED',
    ],
  },
];

export interface MilestoneProgress {
  steps: { key: string; label: string; phase: string; state: 'done' | 'current' | 'upcoming' }[];
  current: MerchantMilestone;
  index: number;
}

/**
 * Where the project is, in milestones. An on-hold project has no place on
 * the track, so it shows the furthest milestone it reached; a completed one
 * shows every milestone done.
 */
export function merchantMilestones(
  stage: ProjectStage,
  visitedStages: readonly ProjectStage[],
): MilestoneProgress {
  const reachedOrder =
    STAGES[stage].order ??
    Math.max(0, ...visitedStages.map((visited) => STAGES[visited].order ?? 0));
  const reachedStage = (Object.keys(STAGES) as ProjectStage[]).find(
    (key) => STAGES[key].order === reachedOrder,
  );
  const foundIndex = MERCHANT_MILESTONES.findIndex((milestone) =>
    milestone.stages.includes(reachedStage ?? 'INTRODUCTION'),
  );
  const index = Math.max(0, foundIndex);
  const completed = stage === 'COMPLETED';
  return {
    index,
    current: MERCHANT_MILESTONES[index]!,
    steps: MERCHANT_MILESTONES.map((milestone, position) => ({
      key: milestone.key,
      label: milestone.label,
      phase: milestone.description,
      state: completed || position < index ? 'done' : position === index ? 'current' : 'upcoming',
    })),
  };
}

// --- Checklist items --------------------------------------------------------

export interface PlainItem {
  title: string;
  help: string;
  /** The merchant can add AHN as a user here instead of sharing a password. */
  inviteUs?: boolean;
}

const ACCESS_COPY: Record<string, PlainItem> = {
  SHOPLINE_ADMIN: {
    title: 'Your new SHOPLINE store',
    help: 'Add us as a staff member on your SHOPLINE store, so we can build it.',
    inviteUs: true,
  },
  SOURCE_PLATFORM: {
    title: 'Your current store',
    help: 'Add us as a staff member on the store you have today, so we can copy your products and pages across.',
    inviteUs: true,
  },
  DOMAIN_DNS: {
    title: 'Your web address settings',
    help: 'Where your web address (like yourstore.com) is managed. We only need it on launch day, to point your address at the new store.',
  },
  PRODUCT_DATA: {
    title: 'Product spreadsheet',
    help: 'A spreadsheet of your products from your current store. If we already have access to that store, we make it for you.',
  },
  CUSTOMER_DATA: {
    title: 'Customer list',
    help: 'Your customer accounts, so they can keep shopping with the same email. Only if moving customers was agreed.',
  },
  ORDER_DATA: {
    title: 'Past orders',
    help: 'Your order history, so customers still see what they bought. Only if moving orders was agreed.',
  },
  APPS_INTEGRATIONS: {
    title: 'Apps you use',
    help: 'The apps on your store today (reviews, subscriptions, loyalty...), and a login for each one we need to move.',
  },
  PAYMENT_GATEWAY: {
    title: 'How you take payments',
    help: 'The payment account (Stripe, PayPal...) for the new store. You set it up; we just need to know it is ready.',
  },
  EMAIL_MARKETING: {
    title: 'Your email newsletter tool',
    help: 'Klaviyo, Mailchimp or similar, so your subscribers and automatic emails keep working.',
    inviteUs: true,
  },
  ANALYTICS: {
    title: 'Your website statistics',
    help: 'Google Analytics, Meta Pixel and similar, so your reports and ads keep tracking after the move.',
    inviteUs: true,
  },
  BRAND_ASSETS: {
    title: 'Where your brand files live',
    help: 'A shared folder (Google Drive, Dropbox) with your logos and images.',
  },
};

const ASSET_COPY: Record<string, PlainItem> = {
  LOGO: {
    title: 'Your logo',
    help: 'A large version of your logo, ideally a light and a dark one.',
  },
  BRAND_GUIDELINES: {
    title: 'Brand guide',
    help: 'Anything that describes how your brand should look and sound. A PDF or a link is fine.',
  },
  FONTS: {
    title: 'Fonts',
    help: 'The fonts your brand uses, or the licence that lets you use them on a website.',
  },
  COLORS: {
    title: 'Brand colours',
    help: 'Your main brand colours. A screenshot of them works as well as colour codes.',
  },
  PRODUCT_IMAGES: {
    title: 'Product photos',
    help: 'The original, full-size photos of your products.',
  },
  PRODUCT_DATA: {
    title: 'Product details',
    help: 'Names, descriptions, options, prices and stock for your products.',
  },
  SITEMAP: {
    title: 'List of your pages',
    help: 'The pages your store has today, so none get lost in the move.',
  },
  URL_STRUCTURE: {
    title: 'Link format for your products',
    help: 'How the links to your products and collections should look on the new store.',
  },
  REDIRECT_MAP: {
    title: 'Old page links to new ones',
    help: "Each old page address matched to its new one, so your Google ranking and customers' bookmarks keep working. We prepare it; you check and approve it.",
  },
  POLICIES: {
    title: 'Store policies',
    help: 'Your returns, privacy, terms and shipping policies.',
  },
  SHIPPING_INFO: { title: 'Shipping', help: 'Where you ship to, and what it costs.' },
  TAX_INFO: { title: 'Tax', help: 'Where you are registered for tax, and the rates you charge.' },
  PAYMENT_INFO: {
    title: 'Payment options',
    help: 'Which ways to pay, and which currencies, your customers should have.',
  },
  LEGAL_INFO: {
    title: 'Business details',
    help: 'Your company name and address, as they should appear on the site and on invoices.',
  },
};

/** An item AHN added by hand keeps the name AHN gave it. */
export function plainAccessItem(item: {
  kind: string;
  label: string;
  notes: string | null;
}): PlainItem {
  return ACCESS_COPY[item.kind] ?? { title: item.label, help: item.notes ?? '' };
}

export function plainAssetItem(item: {
  kind: string;
  label: string;
  notes: string | null;
}): PlainItem {
  return ASSET_COPY[item.kind] ?? { title: item.label, help: item.notes ?? '' };
}

// --- What is waiting on the merchant ---------------------------------------

/**
 * An access item is with the merchant until they have provided it.
 * RECEIVED means they have; AHN is checking it, so it is not counted.
 */
export function accessWaitingOnMerchant(item: { status: AccessStatus }): boolean {
  return item.status === 'NOT_REQUESTED' || item.status === 'REQUESTED' || item.status === 'ISSUE';
}

/** Store login handover is tracked on the Access page; Assets would only repeat it. */
export function shownOnPortalAssets(item: { kind: string }): boolean {
  return item.kind !== 'STORE_CREDENTIALS';
}

/**
 * A required asset is with the merchant until they have sent it - except
 * the redirect list, which AHN prepares and the merchant approves, so it is
 * theirs until it is approved.
 */
export function assetWaitingOnMerchant(item: {
  kind: string;
  status: AssetStatus;
  required: boolean;
}): boolean {
  if (!item.required || !shownOnPortalAssets(item)) return false;
  if (item.kind === 'REDIRECT_MAP') return item.status !== 'APPROVED';
  return item.status === 'NOT_REQUESTED' || item.status === 'REQUESTED' || item.status === 'ISSUE';
}

/**
 * Shown next to the team on the portal once the team commits to a reply
 * time. Left empty on purpose: the number is a promise, so it is AHN's to
 * set, not the software's to invent.
 */
export const REPLY_COMMITMENT: string | null = null;

/**
 * The project history a merchant is shown: things that happened to their
 * migration, not the team's bookkeeping. Stage-by-stage moves, file
 * attachments, reassignments and integration syncs are internal steps - the
 * milestones already say where the project is.
 */
const MERCHANT_FACING_ACTIVITY: ReadonlySet<ActivityType> = new Set<ActivityType>([
  'PROJECT_CREATED',
  'INTRODUCTION_SENT',
  'INTRODUCTION_RESPONSE',
  'BLOCKER_OPENED',
  'BLOCKER_RESOLVED',
  'APPROVAL_REQUESTED',
  'APPROVAL_DECIDED',
  'ISSUE_REPORTED',
  'ISSUE_RESOLVED',
  'COMMENT_POSTED',
]);

export function isMerchantFacingActivity(event: { type: ActivityType }): boolean {
  return MERCHANT_FACING_ACTIVITY.has(event.type);
}

/**
 * When each milestone was reached: the first stage move into any of its
 * stages. Built from the stage-change events the merchant is not shown one
 * by one, so the Conversation page can say "Building your store - 3 Oct"
 * instead of listing every internal step.
 */
export function milestoneReachedAt(
  events: readonly { type: ActivityType; occurredAt: Date; payload: unknown }[],
): Map<string, Date> {
  const reached = new Map<string, Date>();
  for (const event of events) {
    if (event.type !== 'STAGE_CHANGED') continue;
    const to = (event.payload as { to?: unknown } | null)?.to;
    const milestone = MERCHANT_MILESTONES.find((candidate) =>
      candidate.stages.includes(to as ProjectStage),
    );
    if (!milestone) continue;
    const seen = reached.get(milestone.key);
    if (!seen || event.occurredAt < seen) reached.set(milestone.key, event.occurredAt);
  }
  return reached;
}
