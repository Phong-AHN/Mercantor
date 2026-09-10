import type {
  AccessKind,
  AccessStatus,
  ActivityType,
  AgingBand,
  ApprovalStatus,
  ApprovalType,
  AssetKind,
  AssetStatus,
  BlockerCategory,
  CommentCategory,
  CommentStatus,
  CommentVisibility,
  HandoffDecision,
  IntroEmailStatus,
  InvoiceStatus,
  IssueSeverity,
  IssueStatus,
  MigrationType,
  NotificationType,
  ProjectHealth,
  ScopeCategory,
  ScopeDisposition,
  ScopeStatus,
  Team,
  UserRole,
} from './enums';
import type { BankTransactionStatusCode } from './bank-import';

/**
 * Tones map onto the design system's semantic colours. Every map below is a
 * *total* Record, so adding a status is a compile error until somebody decides
 * how it should look - a convention carried over from AHN Orbit.
 */
export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'accent' | 'muted';

export interface Descriptor {
  label: string;
  tone: Tone;
  /** One line, shown in tooltips and empty states. */
  hint?: string;
}

export const TEAM_LABEL: Record<Team, Descriptor> = {
  AHN: { label: 'AHN', tone: 'accent' },
  SHOPLINE: { label: 'SHOPLINE', tone: 'info' },
  MERCHANT: { label: 'Merchant', tone: 'warning' },
  OTHER: { label: 'Unassigned', tone: 'muted' },
};

export const USER_ROLE_LABEL: Record<UserRole, Descriptor> = {
  PLATFORM_ADMIN: { label: 'Platform Admin', tone: 'danger', hint: 'Operates the portal itself.' },
  AHN_ADMIN: { label: 'AHN Admin', tone: 'accent' },
  AHN_PROJECT_MANAGER: { label: 'AHN Project Manager', tone: 'accent' },
  AHN_DEVELOPER: { label: 'AHN Developer', tone: 'accent' },
  SHOPLINE_ADMIN: { label: 'SHOPLINE Admin', tone: 'info' },
  SHOPLINE_ACCOUNT_MANAGER: { label: 'SHOPLINE Account Manager', tone: 'info' },
  SHOPLINE_SOLUTIONS_ENGINEER: { label: 'SHOPLINE Solutions Engineer', tone: 'info' },
  MERCHANT: { label: 'Merchant', tone: 'warning', hint: 'Limited access to their own project.' },
};

export const USER_ROLE_TEAM: Record<UserRole, Team> = {
  PLATFORM_ADMIN: 'AHN',
  AHN_ADMIN: 'AHN',
  AHN_PROJECT_MANAGER: 'AHN',
  AHN_DEVELOPER: 'AHN',
  SHOPLINE_ADMIN: 'SHOPLINE',
  SHOPLINE_ACCOUNT_MANAGER: 'SHOPLINE',
  SHOPLINE_SOLUTIONS_ENGINEER: 'SHOPLINE',
  MERCHANT: 'MERCHANT',
};

export const MIGRATION_TYPE_LABEL: Record<MigrationType, Descriptor> = {
  ONE_TO_ONE: {
    label: '1:1 Migration',
    tone: 'info',
    hint: 'Like-for-like rebuild of the existing store on SHOPLINE.',
  },
  CUSTOM_BUILD: {
    label: 'Custom Build',
    tone: 'accent',
    hint: 'Additional scope beyond a like-for-like migration.',
  },
  HYBRID: {
    label: 'Hybrid',
    tone: 'warning',
    hint: '1:1 migration plus agreed custom work.',
  },
};

export const HEALTH_LABEL: Record<ProjectHealth, Descriptor> = {
  ON_TRACK: { label: 'On Track', tone: 'success' },
  AT_RISK: { label: 'At Risk', tone: 'warning' },
  BLOCKED: { label: 'Blocked', tone: 'danger' },
};

export const AGING_BAND_LABEL: Record<AgingBand, Descriptor> = {
  ON_TRACK: { label: 'On Track', tone: 'success', hint: '0-30 days' },
  ATTENTION: { label: 'Attention', tone: 'info', hint: '31-45 days' },
  DELAYED: { label: 'Delayed', tone: 'warning', hint: '46-60 days' },
  CRITICAL: { label: 'Critical', tone: 'danger', hint: '60+ days' },
};

export const BLOCKER_CATEGORY_LABEL: Record<BlockerCategory, Descriptor> = {
  NONE: { label: 'No blocker', tone: 'success' },
  WAITING_ON_MERCHANT: { label: 'Waiting on merchant', tone: 'warning' },
  WAITING_ON_AHN: { label: 'Waiting on AHN', tone: 'accent' },
  WAITING_ON_SHOPLINE: { label: 'Waiting on SHOPLINE', tone: 'info' },
  ACCESS: { label: 'Access', tone: 'danger' },
  ASSETS: { label: 'Assets', tone: 'warning' },
  DESIGN_APPROVAL: { label: 'Design approval', tone: 'warning' },
  TECHNICAL_ANSWER: { label: 'Technical answer', tone: 'info' },
  PAYMENT: { label: 'Payment', tone: 'danger' },
  QA: { label: 'QA', tone: 'warning' },
  DEPLOYMENT: { label: 'Deployment', tone: 'danger' },
  SCOPE_CLARIFICATION: { label: 'Scope clarification', tone: 'info' },
};

/** The team a blocker category points at by default when one is opened. */
export const BLOCKER_CATEGORY_TEAM: Record<BlockerCategory, Team> = {
  NONE: 'OTHER',
  WAITING_ON_MERCHANT: 'MERCHANT',
  WAITING_ON_AHN: 'AHN',
  WAITING_ON_SHOPLINE: 'SHOPLINE',
  ACCESS: 'MERCHANT',
  ASSETS: 'MERCHANT',
  DESIGN_APPROVAL: 'MERCHANT',
  TECHNICAL_ANSWER: 'SHOPLINE',
  PAYMENT: 'MERCHANT',
  QA: 'AHN',
  DEPLOYMENT: 'SHOPLINE',
  SCOPE_CLARIFICATION: 'SHOPLINE',
};

export const ISSUE_SEVERITY_LABEL: Record<IssueSeverity, Descriptor> = {
  LOW: { label: 'Low', tone: 'muted' },
  MEDIUM: { label: 'Medium', tone: 'info' },
  HIGH: { label: 'High', tone: 'warning' },
  LAUNCH_BLOCKER: { label: 'Launch Blocker', tone: 'danger' },
};

export const ISSUE_STATUS_LABEL: Record<IssueStatus, Descriptor> = {
  OPEN: { label: 'Open', tone: 'danger' },
  IN_PROGRESS: { label: 'In progress', tone: 'info' },
  WAITING_ON_OTHERS: { label: 'Waiting', tone: 'warning' },
  RESOLVED: { label: 'Resolved', tone: 'success' },
  WONT_FIX: { label: "Won't fix", tone: 'muted' },
};

export const ACCESS_STATUS_LABEL: Record<AccessStatus, Descriptor> = {
  NOT_REQUESTED: { label: 'Not requested', tone: 'muted' },
  REQUESTED: { label: 'Requested', tone: 'info' },
  RECEIVED: { label: 'Received', tone: 'warning', hint: 'Received but not yet verified.' },
  VERIFIED: { label: 'Verified', tone: 'success' },
  ISSUE: { label: 'Issue', tone: 'danger' },
};

export const ACCESS_KIND_LABEL: Record<AccessKind, Descriptor> = {
  SHOPLINE_ADMIN: { label: 'SHOPLINE store admin', tone: 'info' },
  SOURCE_PLATFORM: { label: 'Source platform admin', tone: 'neutral' },
  DOMAIN_DNS: { label: 'Domain / DNS', tone: 'neutral' },
  APPS_INTEGRATIONS: { label: 'Apps & integrations', tone: 'neutral' },
  PRODUCT_DATA: { label: 'Product data export', tone: 'neutral' },
  ORDER_DATA: { label: 'Order data export', tone: 'neutral' },
  CUSTOMER_DATA: { label: 'Customer data export', tone: 'neutral' },
  BRAND_ASSETS: { label: 'Brand asset storage', tone: 'neutral' },
  PAYMENT_GATEWAY: { label: 'Payment gateway', tone: 'neutral' },
  EMAIL_MARKETING: { label: 'Email / marketing tools', tone: 'neutral' },
  ANALYTICS: { label: 'Analytics & tracking', tone: 'neutral' },
  OTHER: { label: 'Other', tone: 'muted' },
};

export const ASSET_STATUS_LABEL: Record<AssetStatus, Descriptor> = {
  NOT_REQUESTED: { label: 'Not requested', tone: 'muted' },
  REQUESTED: { label: 'Requested', tone: 'info' },
  RECEIVED: { label: 'Received', tone: 'warning' },
  APPROVED: { label: 'Approved', tone: 'success' },
  ISSUE: { label: 'Issue', tone: 'danger' },
};

export const ASSET_KIND_LABEL: Record<AssetKind, Descriptor> = {
  LOGO: { label: 'Logo files', tone: 'neutral' },
  BRAND_GUIDELINES: { label: 'Brand guidelines', tone: 'neutral' },
  FONTS: { label: 'Fonts / licences', tone: 'neutral' },
  COLORS: { label: 'Colour palette', tone: 'neutral' },
  PRODUCT_IMAGES: { label: 'Product images', tone: 'neutral' },
  PRODUCT_DATA: { label: 'Product data', tone: 'neutral' },
  SITEMAP: { label: 'Sitemap', tone: 'neutral' },
  URL_STRUCTURE: { label: 'URL structure', tone: 'neutral' },
  REDIRECT_MAP: { label: 'Approved redirect map', tone: 'neutral' },
  POLICIES: { label: 'Store policies', tone: 'neutral' },
  SHIPPING_INFO: { label: 'Shipping information', tone: 'neutral' },
  TAX_INFO: { label: 'Tax information', tone: 'neutral' },
  PAYMENT_INFO: { label: 'Payment information', tone: 'neutral' },
  LEGAL_INFO: { label: 'Legal information', tone: 'neutral' },
  STORE_CREDENTIALS: { label: 'Store credentials', tone: 'neutral' },
  OTHER: { label: 'Other', tone: 'muted' },
};

export const SCOPE_CATEGORY_LABEL: Record<ScopeCategory, Descriptor> = {
  PRODUCTS: { label: 'Products', tone: 'neutral' },
  VARIANTS: { label: 'Variants', tone: 'neutral' },
  IMAGES: { label: 'Images', tone: 'neutral' },
  COLLECTIONS: { label: 'Collections', tone: 'neutral' },
  CUSTOMERS: { label: 'Customers', tone: 'neutral' },
  ORDERS: { label: 'Orders', tone: 'neutral' },
  PAGES: { label: 'Pages', tone: 'neutral' },
  NAVIGATION: { label: 'Navigation', tone: 'neutral' },
  POLICIES: { label: 'Policies', tone: 'neutral' },
  THEME_DESIGN: { label: 'Theme / design', tone: 'neutral' },
  REDIRECTS: { label: 'Redirects', tone: 'neutral' },
  APPS_INTEGRATIONS: { label: 'Apps & integrations', tone: 'neutral' },
  OTHER: { label: 'Other', tone: 'muted' },
};

export const SCOPE_DISPOSITION_LABEL: Record<ScopeDisposition, Descriptor> = {
  IN_SCOPE: { label: 'In scope', tone: 'success' },
  OUT_OF_SCOPE: { label: 'Out of scope', tone: 'danger', hint: 'Agreed as excluded.' },
  CHANGE_REQUEST: { label: 'Change request', tone: 'warning', hint: 'Needs approval and pricing.' },
};

export const SCOPE_STATUS_LABEL: Record<ScopeStatus, Descriptor> = {
  NOT_STARTED: { label: 'Not started', tone: 'muted' },
  IN_PROGRESS: { label: 'In progress', tone: 'info' },
  MIGRATED: { label: 'Migrated', tone: 'warning', hint: 'Migrated but not yet validated.' },
  VERIFIED: { label: 'Verified', tone: 'success' },
  BLOCKED: { label: 'Blocked', tone: 'danger' },
};

export const COMMENT_CATEGORY_LABEL: Record<CommentCategory, Descriptor> = {
  GENERAL_UPDATE: { label: 'General update', tone: 'neutral' },
  MERCHANT_REQUEST: { label: 'Merchant request', tone: 'warning' },
  AHN_QUESTION: { label: 'Question for AHN', tone: 'accent' },
  SHOPLINE_QUESTION: { label: 'Question for SHOPLINE', tone: 'info' },
  TECHNICAL_ISSUE: { label: 'Technical issue', tone: 'danger' },
  DESIGN_FEEDBACK: { label: 'Design feedback', tone: 'accent' },
  MIGRATION_ISSUE: { label: 'Migration issue', tone: 'danger' },
  QA_ISSUE: { label: 'QA issue', tone: 'warning' },
  DEPLOYMENT_ISSUE: { label: 'Deployment issue', tone: 'danger' },
  SCOPE_CHANGE: { label: 'Scope change', tone: 'warning' },
};

export const COMMENT_VISIBILITY_LABEL: Record<CommentVisibility, Descriptor> = {
  INTERNAL_AHN: { label: 'AHN internal', tone: 'danger', hint: 'Never leaves AHN.' },
  AHN_SHOPLINE: { label: 'AHN + SHOPLINE', tone: 'info', hint: 'Hidden from the merchant.' },
  EVERYONE: { label: 'Everyone', tone: 'success', hint: 'Merchant can see this.' },
};

export const COMMENT_STATUS_LABEL: Record<CommentStatus, Descriptor> = {
  NONE: { label: 'Note', tone: 'muted' },
  OPEN: { label: 'Open', tone: 'danger' },
  IN_PROGRESS: { label: 'In progress', tone: 'info' },
  RESOLVED: { label: 'Resolved', tone: 'success' },
};

export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, Descriptor> = {
  NOT_INVOICED: { label: 'Not invoiced', tone: 'muted' },
  INVOICE_SENT: { label: 'Invoice sent', tone: 'info' },
  PARTIALLY_PAID: { label: 'Partially paid', tone: 'warning' },
  PAID: { label: 'Paid', tone: 'success' },
  OVERDUE: { label: 'Overdue', tone: 'danger' },
};

export const APPROVAL_TYPE_LABEL: Record<ApprovalType, Descriptor> = {
  DESIGN: { label: 'Design approved', tone: 'accent' },
  DEVELOPMENT: { label: 'Development approved', tone: 'accent' },
  QA: { label: 'QA approved', tone: 'accent' },
  MERCHANT_FINAL: { label: 'Merchant final approval', tone: 'warning' },
  SHOPLINE_DEPLOYMENT: { label: 'SHOPLINE deployment approved', tone: 'info' },
};

export const BANK_TRANSACTION_STATUS_LABEL: Record<BankTransactionStatusCode, Descriptor> = {
  SUCCESS: { label: 'Success', tone: 'success' },
  FAILED: { label: 'Failed', tone: 'danger' },
  PENDING: { label: 'Pending', tone: 'warning' },
  UNKNOWN: { label: 'Unknown', tone: 'muted', hint: 'OCR could not read a status.' },
};

export const APPROVAL_STATUS_LABEL: Record<ApprovalStatus, Descriptor> = {
  NOT_REQUESTED: { label: 'Not requested', tone: 'muted' },
  PENDING: { label: 'Pending', tone: 'warning' },
  APPROVED: { label: 'Approved', tone: 'success' },
  CHANGES_REQUESTED: { label: 'Changes requested', tone: 'warning' },
  REJECTED: { label: 'Rejected', tone: 'danger' },
};

export const HANDOFF_DECISION_LABEL: Record<HandoffDecision, Descriptor> = {
  PENDING: { label: 'Awaiting SHOPLINE', tone: 'warning' },
  APPROVED: { label: 'Deployment approved', tone: 'success' },
  CHANGES_REQUESTED: { label: 'Changes requested', tone: 'warning' },
  ISSUE_REPORTED: { label: 'Issue reported', tone: 'danger' },
};

export const INTRO_EMAIL_STATUS_LABEL: Record<IntroEmailStatus, Descriptor> = {
  DRAFT: { label: 'Draft', tone: 'muted' },
  SENT: { label: 'Sent', tone: 'info' },
  RESPONDED: { label: 'Responded', tone: 'success' },
  BOUNCED: { label: 'Bounced', tone: 'danger' },
};

export const ACTIVITY_TYPE_LABEL: Record<ActivityType, Descriptor> = {
  PROJECT_CREATED: { label: 'Project created', tone: 'neutral' },
  STAGE_CHANGED: { label: 'Stage changed', tone: 'accent' },
  BLOCKER_OPENED: { label: 'Blocker opened', tone: 'danger' },
  BLOCKER_OWNER_CHANGED: { label: 'Blocker reassigned', tone: 'warning' },
  BLOCKER_RESOLVED: { label: 'Blocker resolved', tone: 'success' },
  COMMENT_POSTED: { label: 'Comment', tone: 'neutral' },
  ACCESS_STATUS_CHANGED: { label: 'Access updated', tone: 'info' },
  ASSET_STATUS_CHANGED: { label: 'Asset updated', tone: 'info' },
  SCOPE_CHANGED: { label: 'Scope updated', tone: 'warning' },
  ISSUE_REPORTED: { label: 'Issue reported', tone: 'danger' },
  ISSUE_RESOLVED: { label: 'Issue resolved', tone: 'success' },
  APPROVAL_REQUESTED: { label: 'Approval requested', tone: 'warning' },
  APPROVAL_DECIDED: { label: 'Approval decided', tone: 'success' },
  INTRODUCTION_SENT: { label: 'Introduction sent', tone: 'info' },
  INTRODUCTION_RESPONSE: { label: 'Merchant responded', tone: 'success' },
  INVOICE_UPDATED: { label: 'Invoice updated', tone: 'neutral' },
  HANDOFF_SUBMITTED: { label: 'Submitted to SHOPLINE', tone: 'info' },
  HANDOFF_DECIDED: { label: 'SHOPLINE decision', tone: 'accent' },
  ASSIGNMENT_CHANGED: { label: 'Assignment changed', tone: 'neutral' },
  SLACK_MESSAGE_RECORDED: { label: 'Slack message recorded', tone: 'muted' },
  CLICKUP_SYNCED: { label: 'ClickUp synced', tone: 'muted' },
  PROJECT_UPDATED: { label: 'Project updated', tone: 'neutral' },
  INTEGRATION_LINKED: { label: 'Integration connected', tone: 'info' },
  INTEGRATION_UNLINKED: { label: 'Integration disconnected', tone: 'muted' },
};

export const NOTIFICATION_TYPE_LABEL: Record<NotificationType, Descriptor> = {
  INTRODUCTION_UNANSWERED: { label: 'Introduction unanswered', tone: 'warning' },
  ACCESS_MISSING: { label: 'Access still missing', tone: 'warning' },
  ASSETS_MISSING: { label: 'Assets still missing', tone: 'warning' },
  PROJECT_INACTIVE: { label: 'Project inactive', tone: 'warning' },
  APPROVAL_PENDING: { label: 'Approval pending', tone: 'warning' },
  MERCHANT_FEEDBACK: { label: 'Merchant feedback', tone: 'info' },
  TECHNICAL_ASSISTANCE: { label: 'Technical assistance needed', tone: 'info' },
  LAUNCH_BLOCKER: { label: 'Launch blocker', tone: 'danger' },
  INVOICE_OVERDUE: { label: 'Invoice overdue', tone: 'danger' },
  QA_READY: { label: 'Ready for QA', tone: 'success' },
  SHOPLINE_READY: { label: 'Ready for SHOPLINE', tone: 'success' },
  DEPLOYMENT_APPROVAL: { label: 'Deployment approval', tone: 'success' },
  MENTIONED: { label: 'You were mentioned', tone: 'accent' },
  ASSIGNED: { label: 'Assigned to you', tone: 'accent' },
};
