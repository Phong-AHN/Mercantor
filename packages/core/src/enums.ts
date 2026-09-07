/**
 * Domain vocabulary. Declared here as plain string unions - not imported from
 * the Prisma client - so client components, the design system and the worker
 * can all share one definition without pulling a database driver into a bundle.
 * `packages/db` asserts at build time that these stay in step with the schema.
 */

export const TEAMS = ['AHN', 'SHOPLINE', 'MERCHANT', 'OTHER'] as const;
export type Team = (typeof TEAMS)[number];

export const USER_ROLES = [
  'PLATFORM_ADMIN',
  'AHN_ADMIN',
  'AHN_PROJECT_MANAGER',
  'AHN_DEVELOPER',
  'SHOPLINE_ADMIN',
  'SHOPLINE_ACCOUNT_MANAGER',
  'SHOPLINE_SOLUTIONS_ENGINEER',
  'MERCHANT',
] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const PROJECT_STAGES = [
  'INTRODUCTION',
  'MERCHANT_CONTACTED',
  'KICKOFF_SCHEDULED',
  'WAITING_FOR_ACCESS',
  'ASSETS_COLLECTION',
  'MIGRATION',
  'DESIGN',
  'MERCHANT_DESIGN_REVIEW',
  'DEVELOPMENT',
  'INTERNAL_QA',
  'MERCHANT_QA',
  'MIGRATION_VALIDATION',
  'READY_FOR_SHOPLINE_REVIEW',
  'SHOPLINE_REVIEW',
  'READY_FOR_DEPLOYMENT',
  'DEPLOYED_LIVE',
  'COMPLETED',
  'ON_HOLD_BLOCKED',
] as const;
export type ProjectStage = (typeof PROJECT_STAGES)[number];

export const MIGRATION_TYPES = ['ONE_TO_ONE', 'CUSTOM_BUILD', 'HYBRID'] as const;
export type MigrationType = (typeof MIGRATION_TYPES)[number];

export const PROJECT_HEALTHS = ['ON_TRACK', 'AT_RISK', 'BLOCKED'] as const;
export type ProjectHealth = (typeof PROJECT_HEALTHS)[number];

export const AGING_BANDS = ['ON_TRACK', 'ATTENTION', 'DELAYED', 'CRITICAL'] as const;
export type AgingBand = (typeof AGING_BANDS)[number];

export const BLOCKER_CATEGORIES = [
  'NONE',
  'WAITING_ON_MERCHANT',
  'WAITING_ON_AHN',
  'WAITING_ON_SHOPLINE',
  'ACCESS',
  'ASSETS',
  'DESIGN_APPROVAL',
  'TECHNICAL_ANSWER',
  'PAYMENT',
  'QA',
  'DEPLOYMENT',
  'SCOPE_CLARIFICATION',
] as const;
export type BlockerCategory = (typeof BLOCKER_CATEGORIES)[number];

export const ISSUE_SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'LAUNCH_BLOCKER'] as const;
export type IssueSeverity = (typeof ISSUE_SEVERITIES)[number];

export const ISSUE_STATUSES = [
  'OPEN',
  'IN_PROGRESS',
  'WAITING_ON_OTHERS',
  'RESOLVED',
  'WONT_FIX',
] as const;
export type IssueStatus = (typeof ISSUE_STATUSES)[number];

export const ACCESS_STATUSES = [
  'NOT_REQUESTED',
  'REQUESTED',
  'RECEIVED',
  'VERIFIED',
  'ISSUE',
] as const;
export type AccessStatus = (typeof ACCESS_STATUSES)[number];

export const ACCESS_KINDS = [
  'SHOPLINE_ADMIN',
  'SOURCE_PLATFORM',
  'DOMAIN_DNS',
  'APPS_INTEGRATIONS',
  'PRODUCT_DATA',
  'ORDER_DATA',
  'CUSTOMER_DATA',
  'BRAND_ASSETS',
  'PAYMENT_GATEWAY',
  'EMAIL_MARKETING',
  'ANALYTICS',
  'OTHER',
] as const;
export type AccessKind = (typeof ACCESS_KINDS)[number];

export const ASSET_STATUSES = [
  'NOT_REQUESTED',
  'REQUESTED',
  'RECEIVED',
  'APPROVED',
  'ISSUE',
] as const;
export type AssetStatus = (typeof ASSET_STATUSES)[number];

export const ASSET_KINDS = [
  'LOGO',
  'BRAND_GUIDELINES',
  'FONTS',
  'COLORS',
  'PRODUCT_IMAGES',
  'PRODUCT_DATA',
  'SITEMAP',
  'URL_STRUCTURE',
  'REDIRECT_MAP',
  'POLICIES',
  'SHIPPING_INFO',
  'TAX_INFO',
  'PAYMENT_INFO',
  'LEGAL_INFO',
  'STORE_CREDENTIALS',
  'OTHER',
] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

export const SCOPE_CATEGORIES = [
  'PRODUCTS',
  'VARIANTS',
  'IMAGES',
  'COLLECTIONS',
  'CUSTOMERS',
  'ORDERS',
  'PAGES',
  'NAVIGATION',
  'POLICIES',
  'THEME_DESIGN',
  'REDIRECTS',
  'APPS_INTEGRATIONS',
  'OTHER',
] as const;
export type ScopeCategory = (typeof SCOPE_CATEGORIES)[number];

export const SCOPE_DISPOSITIONS = ['IN_SCOPE', 'OUT_OF_SCOPE', 'CHANGE_REQUEST'] as const;
export type ScopeDisposition = (typeof SCOPE_DISPOSITIONS)[number];

export const SCOPE_STATUSES = [
  'NOT_STARTED',
  'IN_PROGRESS',
  'MIGRATED',
  'VERIFIED',
  'BLOCKED',
] as const;
export type ScopeStatus = (typeof SCOPE_STATUSES)[number];

export const COMMENT_CATEGORIES = [
  'GENERAL_UPDATE',
  'MERCHANT_REQUEST',
  'AHN_QUESTION',
  'SHOPLINE_QUESTION',
  'TECHNICAL_ISSUE',
  'DESIGN_FEEDBACK',
  'MIGRATION_ISSUE',
  'QA_ISSUE',
  'DEPLOYMENT_ISSUE',
  'SCOPE_CHANGE',
] as const;
export type CommentCategory = (typeof COMMENT_CATEGORIES)[number];

/**
 * Visibility is the mechanism behind "internal AHN notes must remain private".
 * It is applied in the service `where` clause, never only in the UI.
 */
export const COMMENT_VISIBILITIES = ['INTERNAL_AHN', 'AHN_SHOPLINE', 'EVERYONE'] as const;
export type CommentVisibility = (typeof COMMENT_VISIBILITIES)[number];

export const COMMENT_STATUSES = ['NONE', 'OPEN', 'IN_PROGRESS', 'RESOLVED'] as const;
export type CommentStatus = (typeof COMMENT_STATUSES)[number];

export const INVOICE_STATUSES = [
  'NOT_INVOICED',
  'INVOICE_SENT',
  'PARTIALLY_PAID',
  'PAID',
  'OVERDUE',
] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const APPROVAL_TYPES = [
  'DESIGN',
  'DEVELOPMENT',
  'QA',
  'MERCHANT_FINAL',
  'SHOPLINE_DEPLOYMENT',
] as const;
export type ApprovalType = (typeof APPROVAL_TYPES)[number];

export const APPROVAL_STATUSES = [
  'NOT_REQUESTED',
  'PENDING',
  'APPROVED',
  'CHANGES_REQUESTED',
  'REJECTED',
] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export const HANDOFF_DECISIONS = [
  'PENDING',
  'APPROVED',
  'CHANGES_REQUESTED',
  'ISSUE_REPORTED',
] as const;
export type HandoffDecision = (typeof HANDOFF_DECISIONS)[number];

export const INTRO_EMAIL_STATUSES = ['DRAFT', 'SENT', 'RESPONDED', 'BOUNCED'] as const;
export type IntroEmailStatus = (typeof INTRO_EMAIL_STATUSES)[number];

export const INTEGRATION_PROVIDERS = ['SLACK', 'CLICKUP', 'EMAIL'] as const;
export type IntegrationProvider = (typeof INTEGRATION_PROVIDERS)[number];

export const OUTBOX_STATUSES = ['PENDING', 'DELIVERED', 'FAILED', 'SKIPPED'] as const;
export type OutboxStatus = (typeof OUTBOX_STATUSES)[number];

export const ACTIVITY_TYPES = [
  'PROJECT_CREATED',
  'STAGE_CHANGED',
  'BLOCKER_OPENED',
  'BLOCKER_OWNER_CHANGED',
  'BLOCKER_RESOLVED',
  'COMMENT_POSTED',
  'ACCESS_STATUS_CHANGED',
  'ASSET_STATUS_CHANGED',
  'SCOPE_CHANGED',
  'ISSUE_REPORTED',
  'ISSUE_RESOLVED',
  'APPROVAL_REQUESTED',
  'APPROVAL_DECIDED',
  'INTRODUCTION_SENT',
  'INTRODUCTION_RESPONSE',
  'INVOICE_UPDATED',
  'HANDOFF_SUBMITTED',
  'HANDOFF_DECIDED',
  'ASSIGNMENT_CHANGED',
  'SLACK_MESSAGE_RECORDED',
  'CLICKUP_SYNCED',
  'PROJECT_UPDATED',
  'INTEGRATION_LINKED',
  'INTEGRATION_UNLINKED',
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const NOTIFICATION_TYPES = [
  'INTRODUCTION_UNANSWERED',
  'ACCESS_MISSING',
  'ASSETS_MISSING',
  'PROJECT_INACTIVE',
  'APPROVAL_PENDING',
  'MERCHANT_FEEDBACK',
  'TECHNICAL_ASSISTANCE',
  'LAUNCH_BLOCKER',
  'INVOICE_OVERDUE',
  'QA_READY',
  'SHOPLINE_READY',
  'DEPLOYMENT_APPROVAL',
  'MENTIONED',
  'ASSIGNED',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const ATTACHMENT_KINDS = ['FILE', 'LINK'] as const;
export type AttachmentKind = (typeof ATTACHMENT_KINDS)[number];
