import type { Descriptor } from './labels';

/**
 * Site QA vocabulary. Mirrors the Prisma enums in `schema.prisma`
 * (StorefrontProfile, Finding, PageCapture, PerfTest and friends) so
 * browser code can share labels and the findings workflow with the server.
 */

export const STOREFRONT_PLATFORMS = [
  'SHOPIFY',
  'SHOPLINE',
  'WOOCOMMERCE',
  'MAGENTO',
  'BIGCOMMERCE',
  'WIX',
  'SQUARESPACE',
  'CUSTOM',
  'UNKNOWN',
] as const;
export type StorefrontPlatform = (typeof STOREFRONT_PLATFORMS)[number];

export const STOREFRONT_BUILDS = [
  'STANDARD_THEME',
  'CUSTOMIZED_THEME',
  'CUSTOM_STOREFRONT',
  'UNKNOWN',
] as const;
export type StorefrontBuild = (typeof STOREFRONT_BUILDS)[number];

export const DETECTION_STATES = ['SUGGESTED', 'CONFIRMED', 'CORRECTED'] as const;
export type DetectionState = (typeof DETECTION_STATES)[number];

export const PAGE_TYPES = [
  'HOME',
  'COLLECTION',
  'PRODUCT',
  'CART',
  'CHECKOUT',
  'SEARCH',
  'ACCOUNT',
  'BLOG',
  'ARTICLE',
  'POLICY',
  'CONTENT',
  'OTHER',
] as const;
export type PageType = (typeof PAGE_TYPES)[number];

export const PAGE_STATES = ['ACCESSIBLE', 'BLOCKED', 'NOT_FOUND', 'ERROR', 'EXCLUDED'] as const;
export type PageState = (typeof PAGE_STATES)[number];

export const FINDING_CATEGORIES = [
  'SPELLING',
  'GRAMMAR',
  'BROKEN_LINK',
  'MISSING_IMAGE',
  'MISSING_ALT',
  'META_TITLE',
  'META_DESCRIPTION',
  'PLACEHOLDER_TEXT',
  'CONTENT_INCONSISTENCY',
  'MOBILE_LAYOUT',
  'RECOMMENDATION',
  'CONSOLE_ERROR',
  'NETWORK_ERROR',
  'PERFORMANCE',
  'OTHER',
] as const;
export type FindingCategory = (typeof FINDING_CATEGORIES)[number];

export const FINDING_SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export type FindingSeverity = (typeof FINDING_SEVERITIES)[number];

export const FINDING_STATUSES = [
  'NEW',
  'REVIEWED',
  'IN_PROGRESS',
  'READY_FOR_VERIFICATION',
  'RESOLVED',
  'DISMISSED',
] as const;
export type FindingStatus = (typeof FINDING_STATUSES)[number];

export const FINDING_SOURCES = ['AUTOMATED', 'AI', 'MANUAL'] as const;
export type FindingSource = (typeof FINDING_SOURCES)[number];

export const CAPTURE_VIEWPORTS = ['DESKTOP', 'MOBILE'] as const;
export type CaptureViewport = (typeof CAPTURE_VIEWPORTS)[number];

export const CAPTURE_PHASES = ['BEFORE', 'AFTER'] as const;
export type CapturePhase = (typeof CAPTURE_PHASES)[number];

export const PERF_TEMPLATES = ['HOME', 'COLLECTION', 'PRODUCT', 'CART', 'CHECKOUT'] as const;
export type PerfTemplate = (typeof PERF_TEMPLATES)[number];

export const ENGAGEMENT_TYPES = ['GLOW_UP', 'PLATFORM_MIGRATION', 'VERSION_UPGRADE'] as const;
export type EngagementType = (typeof ENGAGEMENT_TYPES)[number];

export const STOREFRONT_PLATFORM_LABEL: Record<StorefrontPlatform, Descriptor> = {
  SHOPIFY: { label: 'Shopify', tone: 'neutral' },
  SHOPLINE: { label: 'Shopline', tone: 'info' },
  WOOCOMMERCE: { label: 'WooCommerce', tone: 'neutral' },
  MAGENTO: { label: 'Magento', tone: 'neutral' },
  BIGCOMMERCE: { label: 'BigCommerce', tone: 'neutral' },
  WIX: { label: 'Wix', tone: 'neutral' },
  SQUARESPACE: { label: 'Squarespace', tone: 'neutral' },
  CUSTOM: { label: 'Custom platform', tone: 'neutral' },
  UNKNOWN: { label: 'Unknown', tone: 'muted' },
};

export const STOREFRONT_BUILD_LABEL: Record<StorefrontBuild, Descriptor> = {
  STANDARD_THEME: { label: 'Standard theme', tone: 'neutral' },
  CUSTOMIZED_THEME: { label: 'Customized theme', tone: 'info' },
  CUSTOM_STOREFRONT: { label: 'Custom storefront', tone: 'accent' },
  UNKNOWN: { label: 'Not classified', tone: 'muted' },
};

export const DETECTION_STATE_LABEL: Record<DetectionState, Descriptor> = {
  SUGGESTED: {
    label: 'Suggested',
    tone: 'warning',
    hint: 'Detected automatically from the page. Confirm or correct it.',
  },
  CONFIRMED: { label: 'Confirmed', tone: 'success' },
  CORRECTED: { label: 'Corrected', tone: 'success', hint: 'A person replaced the suggestion.' },
};

export const PAGE_TYPE_LABEL: Record<PageType, Descriptor> = {
  HOME: { label: 'Homepage', tone: 'accent' },
  COLLECTION: { label: 'Collection', tone: 'info' },
  PRODUCT: { label: 'Product', tone: 'info' },
  CART: { label: 'Cart', tone: 'warning' },
  CHECKOUT: { label: 'Checkout', tone: 'warning' },
  SEARCH: { label: 'Search', tone: 'neutral' },
  ACCOUNT: { label: 'Account', tone: 'neutral' },
  BLOG: { label: 'Blog', tone: 'neutral' },
  ARTICLE: { label: 'Article', tone: 'neutral' },
  POLICY: { label: 'Policy', tone: 'muted' },
  CONTENT: { label: 'Content page', tone: 'neutral' },
  OTHER: { label: 'Other', tone: 'muted' },
};

export const PAGE_STATE_LABEL: Record<PageState, Descriptor> = {
  ACCESSIBLE: { label: 'Reachable', tone: 'success' },
  BLOCKED: { label: 'Blocked', tone: 'danger', hint: 'Password page, bot wall or login.' },
  NOT_FOUND: { label: 'Not found', tone: 'danger' },
  ERROR: { label: 'Error', tone: 'danger' },
  EXCLUDED: { label: 'Excluded', tone: 'muted' },
};

export const FINDING_CATEGORY_LABEL: Record<FindingCategory, Descriptor> = {
  SPELLING: { label: 'Spelling', tone: 'neutral' },
  GRAMMAR: { label: 'Grammar', tone: 'neutral' },
  BROKEN_LINK: { label: 'Broken link', tone: 'danger' },
  MISSING_IMAGE: { label: 'Missing image', tone: 'danger' },
  MISSING_ALT: { label: 'Missing alt text', tone: 'warning' },
  META_TITLE: { label: 'Page title', tone: 'warning' },
  META_DESCRIPTION: { label: 'Meta description', tone: 'warning' },
  PLACEHOLDER_TEXT: { label: 'Placeholder content', tone: 'danger' },
  CONTENT_INCONSISTENCY: { label: 'Product / content inconsistency', tone: 'warning' },
  MOBILE_LAYOUT: { label: 'Mobile layout', tone: 'warning' },
  RECOMMENDATION: { label: 'Recommendation', tone: 'info' },
  CONSOLE_ERROR: { label: 'Console error', tone: 'danger' },
  NETWORK_ERROR: { label: 'Network error', tone: 'danger' },
  PERFORMANCE: { label: 'Performance', tone: 'warning' },
  OTHER: { label: 'Other', tone: 'muted' },
};

export const FINDING_SEVERITY_LABEL: Record<FindingSeverity, Descriptor> = {
  LOW: { label: 'Low', tone: 'muted' },
  MEDIUM: { label: 'Medium', tone: 'info' },
  HIGH: { label: 'High', tone: 'warning' },
  CRITICAL: { label: 'Critical', tone: 'danger' },
};

export const FINDING_STATUS_LABEL: Record<FindingStatus, Descriptor> = {
  NEW: { label: 'New', tone: 'danger' },
  REVIEWED: { label: 'Reviewed', tone: 'info', hint: 'Confirmed as a real issue.' },
  IN_PROGRESS: { label: 'In progress', tone: 'warning' },
  READY_FOR_VERIFICATION: {
    label: 'Ready for verification',
    tone: 'accent',
    hint: 'Fixed; waiting for someone to check it on the live page.',
  },
  RESOLVED: { label: 'Resolved', tone: 'success' },
  DISMISSED: { label: 'Dismissed', tone: 'muted' },
};

export const FINDING_SOURCE_LABEL: Record<FindingSource, Descriptor> = {
  AUTOMATED: { label: 'Automated check', tone: 'neutral' },
  AI: { label: 'AI suggestion', tone: 'accent' },
  MANUAL: { label: 'Reported by a person', tone: 'neutral' },
};

export const CAPTURE_VIEWPORT_LABEL: Record<CaptureViewport, Descriptor> = {
  DESKTOP: { label: 'Desktop', tone: 'neutral' },
  MOBILE: { label: 'Mobile', tone: 'neutral' },
};

export const CAPTURE_PHASE_LABEL: Record<CapturePhase, Descriptor> = {
  BEFORE: { label: 'Before', tone: 'neutral' },
  AFTER: { label: 'After', tone: 'accent' },
};

export const PERF_TEMPLATE_LABEL: Record<PerfTemplate, Descriptor> = {
  HOME: { label: 'Homepage', tone: 'accent' },
  COLLECTION: { label: 'Collection', tone: 'info' },
  PRODUCT: { label: 'Product', tone: 'info' },
  CART: { label: 'Cart', tone: 'warning' },
  CHECKOUT: { label: 'Checkout', tone: 'warning' },
};

export const ENGAGEMENT_TYPE_LABEL: Record<EngagementType, Descriptor> = {
  GLOW_UP: { label: 'Glow-Up', tone: 'accent', hint: 'Redesign on the same platform.' },
  PLATFORM_MIGRATION: { label: 'Platform migration', tone: 'info' },
  VERSION_UPGRADE: { label: 'Version upgrade', tone: 'neutral' },
};

/** Statuses that still need somebody to do something. */
export const OPEN_FINDING_STATUSES: readonly FindingStatus[] = [
  'NEW',
  'REVIEWED',
  'IN_PROGRESS',
  'READY_FOR_VERIFICATION',
];

const FINDING_MOVES: Record<FindingStatus, readonly FindingStatus[]> = {
  NEW: ['REVIEWED', 'IN_PROGRESS', 'DISMISSED'],
  REVIEWED: ['IN_PROGRESS', 'DISMISSED', 'NEW'],
  IN_PROGRESS: ['READY_FOR_VERIFICATION', 'REVIEWED', 'DISMISSED'],
  // Verification either passes (resolved) or sends it back to the fixer.
  READY_FOR_VERIFICATION: ['RESOLVED', 'IN_PROGRESS'],
  // Reopened when the problem comes back.
  RESOLVED: ['IN_PROGRESS'],
  DISMISSED: ['NEW'],
};

export function nextFindingStatuses(from: FindingStatus): readonly FindingStatus[] {
  return FINDING_MOVES[from];
}

/**
 * Is this move allowed, and what does it need? A finding is only resolved
 * after someone checked the fix (hence the note), and a dismissal has to say
 * why, so a reader later can tell "not a problem" from "ignored".
 */
export function findingTransition(
  from: FindingStatus,
  to: FindingStatus,
  input: { note?: string | null; reason?: string | null } = {},
): { ok: true } | { ok: false; reason: string } {
  if (from === to) return { ok: false, reason: 'The finding is already in that status.' };
  if (!FINDING_MOVES[from].includes(to)) {
    return {
      ok: false,
      reason: `A ${FINDING_STATUS_LABEL[from].label.toLowerCase()} finding cannot move to ${FINDING_STATUS_LABEL[to].label.toLowerCase()}.`,
    };
  }
  if (to === 'RESOLVED' && !input.note?.trim()) {
    return { ok: false, reason: 'Say how the fix was verified before resolving.' };
  }
  if (to === 'DISMISSED' && !input.reason?.trim()) {
    return { ok: false, reason: 'Give a reason for dismissing this finding.' };
  }
  return { ok: true };
}
