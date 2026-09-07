/**
 * Demo data for Mercantor.
 *
 * It builds seven merchants at seven different points in the migration, with
 * real stage histories, blockers that changed hands, issues, invoices and
 * conversation - because a portal whose whole point is answering "how long has
 * this been waiting" cannot be demonstrated with rows created a second ago.
 *
 * Run: pnpm db:seed   (destructive - it clears the tables it owns first)
 */
import { randomBytes, scryptSync } from 'node:crypto';
import { loadRootEnv } from '@relay/config';
import { PrismaClient, type Prisma } from '@prisma/client';
import {
  DEFAULT_ACCESS_CHECKLIST,
  DEFAULT_ASSET_CHECKLIST,
  DEFAULT_SCOPE_TEMPLATE,
  renderIntroductionEmail,
  STAGES,
  type AccessStatus,
  type AssetStatus,
  type MigrationType,
  type ProjectStage,
  type Team,
} from '@relay/core';

// The seed runs with `packages/db` as its cwd, so it needs the workspace-root
// `.env` the same way the Prisma CLI does.
loadRootEnv();

const db = new PrismaClient();

const DAY = 86_400_000;
const HOUR = 3_600_000;
const NOW = new Date();
const ago = (days: number, hours = 0) => new Date(NOW.getTime() - days * DAY - hours * HOUR);
const ahead = (days: number) => new Date(NOW.getTime() + days * DAY);

const DEMO_PASSWORD = 'relay-demo-password';

/** Matches `@relay/auth`'s format so seeded users can actually sign in. */
function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const N = 2 ** 15;
  const derived = scryptSync(password.normalize('NFKC'), salt, 64, {
    N,
    r: 8,
    p: 1,
    maxmem: 256 * 1024 * 1024,
  });
  return ['scrypt', N, 8, 1, salt.toString('base64'), derived.toString('base64')].join('$');
}

const PASSWORD_HASH = hashPassword(DEMO_PASSWORD);

async function clear() {
  // Order matters: children before parents, even with cascades in place.
  await db.$transaction([
    db.auditLog.deleteMany(),
    db.notification.deleteMany(),
    db.outboxMessage.deleteMany(),
    db.integrationLink.deleteMany(),
    db.introductionEmail.deleteMany(),
    db.handoffSubmission.deleteMany(),
    db.approval.deleteMany(),
    db.invoice.deleteMany(),
    db.commentMention.deleteMany(),
    db.attachment.deleteMany(),
    db.comment.deleteMany(),
    db.activityEvent.deleteMany(),
    db.issue.deleteMany(),
    db.assetItem.deleteMany(),
    db.accessItem.deleteMany(),
    db.scopeItem.deleteMany(),
    db.blockerOwnership.deleteMany(),
    db.project.updateMany({ data: { currentBlockerId: null } }),
    db.blocker.deleteMany(),
    db.stageEvent.deleteMany(),
    db.projectMember.deleteMany(),
    db.savedView.deleteMany(),
    db.project.deleteMany(),
    db.merchantContact.deleteMany(),
    db.merchant.deleteMany(),
    db.session.deleteMany(),
    db.user.deleteMany(),
    db.organizationIntegration.deleteMany(),
    db.organization.deleteMany(),
    db.portalSetting.deleteMany(),
  ]);
}

const USERS = [
  {
    key: 'ahnAdmin',
    email: 'admin@ahnmedia.example',
    name: 'Hoang Nguyen',
    role: 'AHN_ADMIN',
    team: 'AHN',
    title: 'Delivery Director',
  },
  {
    key: 'pmLinh',
    email: 'linh.tran@ahnmedia.example',
    name: 'Linh Tran',
    role: 'AHN_PROJECT_MANAGER',
    team: 'AHN',
    title: 'Senior Project Manager',
  },
  {
    key: 'pmDavid',
    email: 'david.pham@ahnmedia.example',
    name: 'David Pham',
    role: 'AHN_PROJECT_MANAGER',
    team: 'AHN',
    title: 'Project Manager',
  },
  {
    key: 'devMarcus',
    email: 'marcus.hale@ahnmedia.example',
    name: 'Marcus Hale',
    role: 'AHN_DEVELOPER',
    team: 'AHN',
    title: 'Lead Developer',
  },
  {
    key: 'devAnh',
    email: 'anh.vu@ahnmedia.example',
    name: 'Anh Vu',
    role: 'AHN_DEVELOPER',
    team: 'AHN',
    title: 'Front-end Developer',
  },
  {
    key: 'slAdmin',
    email: 'ops@shopline.example',
    name: 'Grace Lim',
    role: 'SHOPLINE_ADMIN',
    team: 'SHOPLINE',
    title: 'Partner Operations Lead',
  },
  {
    key: 'slPriya',
    email: 'priya.raman@shopline.example',
    name: 'Priya Raman',
    role: 'SHOPLINE_ACCOUNT_MANAGER',
    team: 'SHOPLINE',
    title: 'Account Manager',
  },
  {
    key: 'slJonas',
    email: 'jonas.weber@shopline.example',
    name: 'Jonas Weber',
    role: 'SHOPLINE_ACCOUNT_MANAGER',
    team: 'SHOPLINE',
    title: 'Account Manager',
  },
  {
    key: 'slDan',
    email: 'dan.okafor@shopline.example',
    name: 'Dan Okafor',
    role: 'SHOPLINE_SOLUTIONS_ENGINEER',
    team: 'SHOPLINE',
    title: 'Solutions Engineer',
  },
  {
    key: 'merchantSunrise',
    email: 'owner@sunrisecoffee.example',
    name: 'Maya Ortiz',
    role: 'MERCHANT',
    team: 'MERCHANT',
    title: 'Founder, Sunrise Coffee',
  },
  {
    key: 'merchantNordic',
    email: 'ops@nordicthread.example',
    name: 'Erik Lindqvist',
    role: 'MERCHANT',
    team: 'MERCHANT',
    title: 'Head of Ecommerce, Nordic Thread',
  },
] as const;

type UserKey = (typeof USERS)[number]['key'];

interface StageStep {
  stage: ProjectStage;
  enteredAt: Date;
  exitedAt: Date | null;
  reason?: string;
}

interface BlockerSpec {
  category: Prisma.BlockerCreateManyInput['category'];
  title: string;
  description: string;
  nextAction: string;
  startedAt: Date;
  dueDate?: Date | null;
  resolvedAt?: Date | null;
  resolution?: string | null;
  ownerships: {
    team: Team;
    userKey?: UserKey;
    startedAt: Date;
    endedAt: Date | null;
    note?: string;
  }[];
}

interface ProjectSpec {
  code: string;
  merchant: {
    name: string;
    website: string;
    storeId: string;
    platform: string;
    country: string;
    industry: string;
    contact: { name: string; email: string; phone: string; title: string };
  };
  migrationType: MigrationType;
  stage: ProjectStage;
  startDaysAgo: number;
  targetInDays: number | null;
  completedDaysAgo?: number;
  pm: UserKey;
  dev: UserKey | null;
  am: UserKey;
  se: UserKey | null;
  memberKeys?: UserKey[];
  scopeSummary: string;
  contractTotalMinor: number;
  stages: StageStep[];
  blockers: BlockerSpec[];
  accessOverrides?: Partial<Record<string, AccessStatus>>;
  assetOverrides?: Partial<Record<string, AssetStatus>>;
  scopeCounts?: Partial<Record<string, { source: number; migrated: number }>>;
  outOfScope?: string[];
  changeRequests?: { category: string; label: string; amountMinor: number; note: string }[];
  approvals: Partial<
    Record<
      'DESIGN' | 'DEVELOPMENT' | 'QA' | 'MERCHANT_FINAL' | 'SHOPLINE_DEPLOYMENT',
      { status: Prisma.ApprovalCreateManyInput['status']; decidedDaysAgo?: number; notes?: string }
    >
  >;
  invoices: {
    milestone: string;
    number?: string;
    amountMinor: number;
    paidMinor: number;
    status: Prisma.InvoiceCreateManyInput['status'];
    invoiceDaysAgo?: number;
    dueInDays?: number;
    paidDaysAgo?: number;
  }[];
  issues: {
    title: string;
    description: string;
    severity: Prisma.IssueCreateManyInput['severity'];
    status: Prisma.IssueCreateManyInput['status'];
    ownerTeam: Team;
    ownerKey?: UserKey;
    reporterKey: UserKey;
    reportedDaysAgo: number;
    resolvedDaysAgo?: number;
    resolution?: string;
  }[];
  comments: {
    authorKey: UserKey;
    body: string;
    category: Prisma.CommentCreateManyInput['category'];
    visibility: Prisma.CommentCreateManyInput['visibility'];
    status?: Prisma.CommentCreateManyInput['status'];
    daysAgo: number;
    mentions?: UserKey[];
    source?: Prisma.CommentCreateManyInput['source'];
    sourceUrl?: string;
  }[];
  nextAction: { text: string; ownerKey: UserKey | null; ownerTeam: Team; dueInDays: number | null };
  slackChannel?: { id: string; name: string };
  clickupTask?: { id: string; name: string };
  introSentDaysAgo?: number;
  introRespondedDaysAgo?: number;
  handoff?: {
    submittedDaysAgo: number;
    decision: Prisma.HandoffSubmissionCreateManyInput['decision'];
    decidedDaysAgo?: number;
    notes?: string;
    decisionNotes?: string;
  };
}

const PROJECTS: ProjectSpec[] = [
  // 1 - deep in development, blocked on the merchant, past target
  {
    code: 'PRJ-0001',
    merchant: {
      name: 'Sunrise Coffee Roasters',
      website: 'https://sunrisecoffee.example',
      storeId: 'SL-88213',
      platform: 'Shopify Plus',
      country: 'United States',
      industry: 'Food & beverage',
      contact: {
        name: 'Maya Ortiz',
        email: 'owner@sunrisecoffee.example',
        phone: '+1 415 555 0142',
        title: 'Founder',
      },
    },
    migrationType: 'HYBRID',
    stage: 'DEVELOPMENT',
    startDaysAgo: 52,
    targetInDays: -4,
    pm: 'pmLinh',
    dev: 'devMarcus',
    am: 'slPriya',
    se: 'slDan',
    memberKeys: ['merchantSunrise'],
    scopeSummary:
      '1:1 migration of the full catalogue plus a custom subscription flow and a wholesale portal.',
    contractTotalMinor: 2_400_000,
    stages: [
      { stage: 'INTRODUCTION', enteredAt: ago(52), exitedAt: ago(51) },
      { stage: 'MERCHANT_CONTACTED', enteredAt: ago(51), exitedAt: ago(49) },
      { stage: 'KICKOFF_SCHEDULED', enteredAt: ago(49), exitedAt: ago(46) },
      { stage: 'WAITING_FOR_ACCESS', enteredAt: ago(46), exitedAt: ago(38) },
      { stage: 'ASSETS_COLLECTION', enteredAt: ago(38), exitedAt: ago(31) },
      { stage: 'MIGRATION', enteredAt: ago(31), exitedAt: ago(24) },
      { stage: 'DESIGN', enteredAt: ago(24), exitedAt: ago(17) },
      { stage: 'MERCHANT_DESIGN_REVIEW', enteredAt: ago(17), exitedAt: ago(9) },
      {
        stage: 'DESIGN',
        enteredAt: ago(9),
        exitedAt: ago(6),
        reason: 'Merchant requested a hero and PDP rework.',
      },
      { stage: 'DEVELOPMENT', enteredAt: ago(6), exitedAt: null },
    ],
    blockers: [
      {
        category: 'ASSETS',
        title: 'Waiting on the approved redirect map for 1,240 URLs',
        description:
          'AHN produced the mapping from the Shopify sitemap. The merchant has to confirm the 40 collection URLs that do not map cleanly before development can finish the redirect table.',
        nextAction: 'Merchant to review and approve the redirect spreadsheet.',
        startedAt: ago(5),
        dueDate: ahead(1),
        ownerships: [
          {
            team: 'AHN',
            userKey: 'pmLinh',
            startedAt: ago(5),
            endedAt: ago(4),
            note: 'Preparing the mapping file.',
          },
          {
            team: 'MERCHANT',
            startedAt: ago(4),
            endedAt: null,
            note: 'Sent to merchant for approval.',
          },
        ],
      },
      {
        category: 'TECHNICAL_ANSWER',
        title: 'Subscription API rate limits on SHOPLINE',
        description:
          'Bulk import of 2,300 active subscriptions exceeds the documented write limit. Needs a confirmed approach from SHOPLINE engineering.',
        nextAction: 'SHOPLINE to confirm a batch import window.',
        startedAt: ago(12),
        resolvedAt: ago(8),
        resolution: 'SHOPLINE granted a temporary raised limit for the import window on 04:00 UTC.',
        ownerships: [{ team: 'SHOPLINE', userKey: 'slDan', startedAt: ago(12), endedAt: ago(8) }],
      },
    ],
    accessOverrides: {
      'SHOPLINE store admin access': 'VERIFIED',
      'Current platform admin access': 'VERIFIED',
      'Domain registrar / DNS access': 'REQUESTED',
      'Product & inventory data export': 'VERIFIED',
      'Customer data export': 'VERIFIED',
      'Order history export': 'RECEIVED',
      'Apps & third-party integrations': 'ISSUE',
      'Payment gateway account': 'VERIFIED',
      'Email / marketing platform': 'RECEIVED',
      'Analytics & tracking accounts': 'REQUESTED',
      'Brand asset storage': 'VERIFIED',
    },
    assetOverrides: {
      'Logo files': 'APPROVED',
      'Brand guidelines': 'APPROVED',
      'Fonts and licences': 'APPROVED',
      'Colour palette': 'APPROVED',
      'Product images': 'APPROVED',
      'Product data': 'APPROVED',
      Sitemap: 'APPROVED',
      'URL structure': 'APPROVED',
      'Approved redirect map': 'RECEIVED',
      'Store policies': 'APPROVED',
      'Shipping configuration': 'RECEIVED',
      'Tax configuration': 'REQUESTED',
      'Payment configuration': 'APPROVED',
      'Store credentials handover': 'APPROVED',
    },
    scopeCounts: {
      Products: { source: 486, migrated: 486 },
      Variants: { source: 1342, migrated: 1342 },
      Images: { source: 2210, migrated: 2198 },
      Collections: { source: 38, migrated: 38 },
      Customers: { source: 14820, migrated: 14820 },
      Orders: { source: 61340, migrated: 58900 },
      Pages: { source: 24, migrated: 24 },
      Redirects: { source: 1240, migrated: 0 },
    },
    changeRequests: [
      {
        category: 'APPS_INTEGRATIONS',
        label: 'Wholesale portal with tiered pricing',
        amountMinor: 480_000,
        note: 'Agreed at kickoff as additional scope. Priced and approved.',
      },
    ],
    approvals: {
      DESIGN: {
        status: 'APPROVED',
        decidedDaysAgo: 6,
        notes: 'Approved after the second round of hero revisions.',
      },
      DEVELOPMENT: { status: 'NOT_REQUESTED' },
      QA: { status: 'NOT_REQUESTED' },
      MERCHANT_FINAL: { status: 'NOT_REQUESTED' },
      SHOPLINE_DEPLOYMENT: { status: 'NOT_REQUESTED' },
    },
    invoices: [
      {
        milestone: 'Deposit (40%)',
        number: 'AHN-2411',
        amountMinor: 960_000,
        paidMinor: 960_000,
        status: 'PAID',
        invoiceDaysAgo: 50,
        dueInDays: -36,
        paidDaysAgo: 41,
      },
      {
        milestone: 'Design sign-off (30%)',
        number: 'AHN-2478',
        amountMinor: 720_000,
        paidMinor: 0,
        status: 'OVERDUE',
        invoiceDaysAgo: 20,
        dueInDays: -6,
      },
      { milestone: 'Launch (30%)', amountMinor: 720_000, paidMinor: 0, status: 'NOT_INVOICED' },
    ],
    issues: [
      {
        title: 'Subscription renewal dates shift by one day on import',
        description:
          'Renewal timestamps are being written in local time rather than UTC, moving every renewal back a day for customers west of GMT.',
        severity: 'LAUNCH_BLOCKER',
        status: 'IN_PROGRESS',
        ownerTeam: 'AHN',
        ownerKey: 'devMarcus',
        reporterKey: 'devAnh',
        reportedDaysAgo: 3,
      },
      {
        title: 'Product images above 4MB fail to upload',
        description: '12 of 2,210 images exceed the upload limit and need resizing before import.',
        severity: 'MEDIUM',
        status: 'RESOLVED',
        ownerTeam: 'AHN',
        ownerKey: 'devAnh',
        reporterKey: 'pmLinh',
        reportedDaysAgo: 22,
        resolvedDaysAgo: 21,
        resolution: 'Batch-resized to 3,000px longest edge and re-uploaded.',
      },
      {
        title: 'Wholesale tier pricing rounds incorrectly at 3 decimal places',
        description: 'Tier 3 pricing shows 12.996 instead of 13.00 on the PDP.',
        severity: 'HIGH',
        status: 'OPEN',
        ownerTeam: 'AHN',
        ownerKey: 'devMarcus',
        reporterKey: 'slDan',
        reportedDaysAgo: 2,
      },
    ],
    comments: [
      {
        authorKey: 'pmLinh',
        body: 'Redirect spreadsheet is with Maya. 40 collection URLs need a decision - the rest map cleanly. Development is otherwise ready to close out the redirect table.',
        category: 'MERCHANT_REQUEST',
        visibility: 'EVERYONE',
        status: 'OPEN',
        daysAgo: 4,
        mentions: ['merchantSunrise', 'slPriya'],
      },
      {
        authorKey: 'devMarcus',
        body: 'Renewal date bug is a timezone conversion in the subscription importer. Fix is written, needs a re-run of the 2,300 subscription import to verify.',
        category: 'TECHNICAL_ISSUE',
        visibility: 'AHN_SHOPLINE',
        status: 'IN_PROGRESS',
        daysAgo: 2,
      },
      {
        authorKey: 'pmLinh',
        body: 'Internal: the design rework cost us 3 days. If the redirect map lands tomorrow we can still hit the launch window, otherwise we should reset expectations with Priya rather than let it slip quietly.',
        category: 'GENERAL_UPDATE',
        visibility: 'INTERNAL_AHN',
        daysAgo: 3,
      },
      {
        authorKey: 'slPriya',
        body: 'Maya mentioned on our call she is travelling until Thursday. Flagging so the redirect approval timing is not a surprise.',
        category: 'GENERAL_UPDATE',
        visibility: 'AHN_SHOPLINE',
        daysAgo: 1,
        source: 'SLACK',
        sourceUrl:
          'https://shopline.slack.example/archives/C-SHOPLINE-MIGRATIONS/p1731500000000100',
      },
    ],
    nextAction: {
      text: 'Merchant approves the redirect map so development can close the redirect table.',
      ownerKey: 'merchantSunrise',
      ownerTeam: 'MERCHANT',
      dueInDays: 1,
    },
    slackChannel: { id: 'C-SHOPLINE-MIGRATIONS', name: '#shopline-migrations' },
    clickupTask: { id: '86def1024', name: 'Sunrise Coffee - SHOPLINE migration' },
    introSentDaysAgo: 51,
    introRespondedDaysAgo: 49,
  },

  // 2 - waiting on SHOPLINE review, healthy
  {
    code: 'PRJ-0002',
    merchant: {
      name: 'Nordic Thread',
      website: 'https://nordicthread.example',
      storeId: 'SL-90114',
      platform: 'WooCommerce',
      country: 'Sweden',
      industry: 'Apparel',
      contact: {
        name: 'Erik Lindqvist',
        email: 'ops@nordicthread.example',
        phone: '+46 8 555 0173',
        title: 'Head of Ecommerce',
      },
    },
    migrationType: 'ONE_TO_ONE',
    stage: 'SHOPLINE_REVIEW',
    startDaysAgo: 34,
    targetInDays: 6,
    pm: 'pmDavid',
    dev: 'devAnh',
    am: 'slJonas',
    se: 'slDan',
    memberKeys: ['merchantNordic'],
    scopeSummary: 'Straight 1:1 rebuild of the WooCommerce store, no additional scope.',
    contractTotalMinor: 1_450_000,
    stages: [
      { stage: 'INTRODUCTION', enteredAt: ago(34), exitedAt: ago(33) },
      { stage: 'MERCHANT_CONTACTED', enteredAt: ago(33), exitedAt: ago(32) },
      { stage: 'KICKOFF_SCHEDULED', enteredAt: ago(32), exitedAt: ago(30) },
      { stage: 'WAITING_FOR_ACCESS', enteredAt: ago(30), exitedAt: ago(27) },
      { stage: 'ASSETS_COLLECTION', enteredAt: ago(27), exitedAt: ago(23) },
      { stage: 'MIGRATION', enteredAt: ago(23), exitedAt: ago(17) },
      { stage: 'DESIGN', enteredAt: ago(17), exitedAt: ago(12) },
      { stage: 'MERCHANT_DESIGN_REVIEW', enteredAt: ago(12), exitedAt: ago(10) },
      { stage: 'DEVELOPMENT', enteredAt: ago(10), exitedAt: ago(5) },
      { stage: 'INTERNAL_QA', enteredAt: ago(5), exitedAt: ago(3) },
      { stage: 'MERCHANT_QA', enteredAt: ago(3), exitedAt: ago(2) },
      { stage: 'MIGRATION_VALIDATION', enteredAt: ago(2), exitedAt: ago(1, 6) },
      { stage: 'READY_FOR_SHOPLINE_REVIEW', enteredAt: ago(1, 6), exitedAt: ago(0, 20) },
      { stage: 'SHOPLINE_REVIEW', enteredAt: ago(0, 20), exitedAt: null },
    ],
    blockers: [],
    accessOverrides: Object.fromEntries(
      DEFAULT_ACCESS_CHECKLIST.map((item) => [item.label, 'VERIFIED' as AccessStatus]),
    ),
    assetOverrides: Object.fromEntries(
      DEFAULT_ASSET_CHECKLIST.map((item) => [item.label, 'APPROVED' as AssetStatus]),
    ),
    scopeCounts: {
      Products: { source: 312, migrated: 312 },
      Variants: { source: 1104, migrated: 1104 },
      Images: { source: 1580, migrated: 1580 },
      Collections: { source: 22, migrated: 22 },
      Customers: { source: 8940, migrated: 8940 },
      Orders: { source: 27600, migrated: 27600 },
      Pages: { source: 16, migrated: 16 },
      Redirects: { source: 640, migrated: 640 },
    },
    outOfScope: ['Apps & integrations'],
    approvals: {
      DESIGN: { status: 'APPROVED', decidedDaysAgo: 10, notes: 'Approved first time round.' },
      DEVELOPMENT: { status: 'APPROVED', decidedDaysAgo: 5 },
      QA: { status: 'APPROVED', decidedDaysAgo: 2, notes: 'All 84 QA cases passed.' },
      MERCHANT_FINAL: {
        status: 'APPROVED',
        decidedDaysAgo: 2,
        notes: 'Erik signed off after the merchant QA pass.',
      },
      SHOPLINE_DEPLOYMENT: { status: 'PENDING' },
    },
    invoices: [
      {
        milestone: 'Deposit (50%)',
        number: 'AHN-2455',
        amountMinor: 725_000,
        paidMinor: 725_000,
        status: 'PAID',
        invoiceDaysAgo: 32,
        dueInDays: -18,
        paidDaysAgo: 25,
      },
      {
        milestone: 'Launch (50%)',
        number: 'AHN-2502',
        amountMinor: 725_000,
        paidMinor: 0,
        status: 'INVOICE_SENT',
        invoiceDaysAgo: 2,
        dueInDays: 12,
      },
    ],
    issues: [
      {
        title: 'Swedish characters mangled in 3 collection descriptions',
        description: 'Encoding issue on import affecting å, ä and ö in three descriptions.',
        severity: 'LOW',
        status: 'RESOLVED',
        ownerTeam: 'AHN',
        ownerKey: 'devAnh',
        reporterKey: 'merchantNordic',
        reportedDaysAgo: 4,
        resolvedDaysAgo: 4,
        resolution: 'Re-imported the three descriptions as UTF-8.',
      },
    ],
    comments: [
      {
        authorKey: 'pmDavid',
        body: 'Handoff package submitted. Migration validated at 100% on products, customers and orders; 640 redirects live and spot-checked.',
        category: 'GENERAL_UPDATE',
        visibility: 'AHN_SHOPLINE',
        daysAgo: 1,
        mentions: ['slJonas'],
      },
      {
        authorKey: 'slJonas',
        body: 'Picked this up for review. Looks clean so far - checking payment configuration and tracking, expect a decision tomorrow.',
        category: 'GENERAL_UPDATE',
        visibility: 'AHN_SHOPLINE',
        daysAgo: 0,
      },
    ],
    nextAction: {
      text: 'SHOPLINE completes review and approves deployment.',
      ownerKey: 'slJonas',
      ownerTeam: 'SHOPLINE',
      dueInDays: 2,
    },
    slackChannel: { id: 'C-SHOPLINE-LAUNCHES', name: '#shopline-launches' },
    clickupTask: { id: '86def2077', name: 'Nordic Thread - SHOPLINE migration' },
    introSentDaysAgo: 33,
    introRespondedDaysAgo: 32,
    handoff: {
      submittedDaysAgo: 1,
      decision: 'PENDING',
      notes:
        'DNS cutover planned for 02:00 UTC. Old store stays live in maintenance mode for 48 hours as a rollback path.',
    },
  },

  // 3 - stuck waiting for access, critical age
  {
    code: 'PRJ-0003',
    merchant: {
      name: 'Atlas Outdoor Supply',
      website: 'https://atlasoutdoor.example',
      storeId: 'SL-77420',
      platform: 'Magento 2',
      country: 'Canada',
      industry: 'Outdoor & sports',
      contact: {
        name: 'Rebecca Shaw',
        email: 'rebecca@atlasoutdoor.example',
        phone: '+1 604 555 0198',
        title: 'Operations Manager',
      },
    },
    migrationType: 'ONE_TO_ONE',
    stage: 'WAITING_FOR_ACCESS',
    startDaysAgo: 63,
    targetInDays: -12,
    pm: 'pmLinh',
    dev: null,
    am: 'slPriya',
    se: null,
    scopeSummary: '1:1 migration from Magento 2. Large catalogue, heavy B2B customer base.',
    contractTotalMinor: 1_900_000,
    stages: [
      { stage: 'INTRODUCTION', enteredAt: ago(63), exitedAt: ago(60) },
      { stage: 'MERCHANT_CONTACTED', enteredAt: ago(60), exitedAt: ago(54) },
      { stage: 'KICKOFF_SCHEDULED', enteredAt: ago(54), exitedAt: ago(48) },
      { stage: 'WAITING_FOR_ACCESS', enteredAt: ago(48), exitedAt: null },
    ],
    blockers: [
      {
        category: 'ACCESS',
        title: 'No Magento admin access after six weeks',
        description:
          'The merchant has changed agency twice. Nobody currently on their side has Magento admin credentials; their previous developer has not responded.',
        nextAction:
          'Merchant to recover Magento admin via hosting provider, or authorise a database export instead.',
        startedAt: ago(48),
        dueDate: ago(30),
        ownerships: [
          { team: 'MERCHANT', startedAt: ago(48), endedAt: ago(20) },
          {
            team: 'SHOPLINE',
            userKey: 'slPriya',
            startedAt: ago(20),
            endedAt: ago(6),
            note: 'Escalated to SHOPLINE to apply commercial pressure.',
          },
          {
            team: 'MERCHANT',
            startedAt: ago(6),
            endedAt: null,
            note: 'Back with the merchant after the escalation call.',
          },
        ],
      },
    ],
    accessOverrides: {
      'SHOPLINE store admin access': 'VERIFIED',
      'Current platform admin access': 'ISSUE',
      'Domain registrar / DNS access': 'NOT_REQUESTED',
      'Product & inventory data export': 'REQUESTED',
      'Customer data export': 'REQUESTED',
      'Order history export': 'REQUESTED',
    },
    assetOverrides: {
      'Logo files': 'RECEIVED',
      'Colour palette': 'RECEIVED',
      'Brand guidelines': 'REQUESTED',
    },
    approvals: {},
    invoices: [
      {
        milestone: 'Deposit (40%)',
        number: 'AHN-2402',
        amountMinor: 760_000,
        paidMinor: 760_000,
        status: 'PAID',
        invoiceDaysAgo: 60,
        dueInDays: -46,
        paidDaysAgo: 52,
      },
    ],
    issues: [],
    comments: [
      {
        authorKey: 'pmLinh',
        body: 'Sixth request for Magento admin. We cannot start migration without either admin access or a full database export. This project has been idle for six weeks and the deposit is already paid.',
        category: 'MERCHANT_REQUEST',
        visibility: 'AHN_SHOPLINE',
        status: 'OPEN',
        daysAgo: 6,
        mentions: ['slPriya'],
      },
      {
        authorKey: 'slPriya',
        body: 'Ran an escalation call with Rebecca. Their hosting provider can restore admin - they have opened a ticket. Committed to having credentials by the end of this week.',
        category: 'GENERAL_UPDATE',
        visibility: 'AHN_SHOPLINE',
        daysAgo: 6,
      },
      {
        authorKey: 'pmLinh',
        body: 'Internal: we should treat the launch date as void, not late. Nothing has been technically possible for 48 days and the current target is meaningless.',
        category: 'GENERAL_UPDATE',
        visibility: 'INTERNAL_AHN',
        daysAgo: 5,
      },
    ],
    nextAction: {
      text: 'Merchant restores Magento admin access through their hosting provider.',
      ownerKey: null,
      ownerTeam: 'MERCHANT',
      dueInDays: 2,
    },
    slackChannel: { id: 'C-AHN-SHOPLINE-ESCALATION', name: '#ahn-shopline-escalation' },
    introSentDaysAgo: 60,
    introRespondedDaysAgo: 55,
  },

  // 4 - fresh, introduction not yet answered
  {
    code: 'PRJ-0004',
    merchant: {
      name: 'Verdant Home',
      website: 'https://verdanthome.example',
      storeId: 'SL-91882',
      platform: 'Wix',
      country: 'United Kingdom',
      industry: 'Home & garden',
      contact: {
        name: 'Oliver Bennett',
        email: 'oliver@verdanthome.example',
        phone: '+44 20 7946 0102',
        title: 'Director',
      },
    },
    migrationType: 'ONE_TO_ONE',
    stage: 'MERCHANT_CONTACTED',
    startDaysAgo: 6,
    targetInDays: 45,
    pm: 'pmDavid',
    dev: null,
    am: 'slJonas',
    se: null,
    scopeSummary: 'Small catalogue migration off Wix. Scope to be confirmed at kickoff.',
    contractTotalMinor: 680_000,
    stages: [
      { stage: 'INTRODUCTION', enteredAt: ago(6), exitedAt: ago(5) },
      { stage: 'MERCHANT_CONTACTED', enteredAt: ago(5), exitedAt: null },
    ],
    blockers: [
      {
        category: 'WAITING_ON_MERCHANT',
        title: 'Introduction email unanswered for 5 days',
        description:
          'The standard introduction went out with SHOPLINE and AHN both on the thread. No response yet.',
        nextAction: 'SHOPLINE account manager to follow up by phone.',
        startedAt: ago(3),
        dueDate: ahead(1),
        ownerships: [{ team: 'MERCHANT', startedAt: ago(3), endedAt: null }],
      },
    ],
    approvals: {},
    invoices: [
      { milestone: 'Deposit (50%)', amountMinor: 340_000, paidMinor: 0, status: 'NOT_INVOICED' },
    ],
    issues: [],
    comments: [
      {
        authorKey: 'slJonas',
        body: 'Introduction sent Monday. No reply yet - I will call Oliver directly tomorrow morning.',
        category: 'GENERAL_UPDATE',
        visibility: 'AHN_SHOPLINE',
        daysAgo: 2,
      },
    ],
    nextAction: {
      text: 'SHOPLINE follows up on the unanswered introduction.',
      ownerKey: 'slJonas',
      ownerTeam: 'SHOPLINE',
      dueInDays: 1,
    },
    introSentDaysAgo: 5,
  },

  // 5 - merchant design review
  {
    code: 'PRJ-0005',
    merchant: {
      name: 'Lumen Skincare',
      website: 'https://lumenskin.example',
      storeId: 'SL-90455',
      platform: 'Shopify',
      country: 'Australia',
      industry: 'Beauty',
      contact: {
        name: 'Chloe Nguyen',
        email: 'chloe@lumenskin.example',
        phone: '+61 2 5550 0119',
        title: 'Brand Manager',
      },
    },
    migrationType: 'CUSTOM_BUILD',
    stage: 'MERCHANT_DESIGN_REVIEW',
    startDaysAgo: 27,
    targetInDays: 21,
    pm: 'pmLinh',
    dev: 'devAnh',
    am: 'slPriya',
    se: 'slDan',
    scopeSummary:
      'Custom build: new visual direction, quiz-driven product finder, and subscription bundles. Catalogue migration included.',
    contractTotalMinor: 3_150_000,
    stages: [
      { stage: 'INTRODUCTION', enteredAt: ago(27), exitedAt: ago(26) },
      { stage: 'MERCHANT_CONTACTED', enteredAt: ago(26), exitedAt: ago(25) },
      { stage: 'KICKOFF_SCHEDULED', enteredAt: ago(25), exitedAt: ago(22) },
      { stage: 'WAITING_FOR_ACCESS', enteredAt: ago(22), exitedAt: ago(19) },
      { stage: 'ASSETS_COLLECTION', enteredAt: ago(19), exitedAt: ago(14) },
      { stage: 'MIGRATION', enteredAt: ago(14), exitedAt: ago(9) },
      { stage: 'DESIGN', enteredAt: ago(9), exitedAt: ago(2) },
      { stage: 'MERCHANT_DESIGN_REVIEW', enteredAt: ago(2), exitedAt: null },
    ],
    blockers: [],
    accessOverrides: {
      'SHOPLINE store admin access': 'VERIFIED',
      'Current platform admin access': 'VERIFIED',
      'Domain registrar / DNS access': 'RECEIVED',
      'Product & inventory data export': 'VERIFIED',
      'Brand asset storage': 'VERIFIED',
      'Email / marketing platform': 'VERIFIED',
    },
    assetOverrides: {
      'Logo files': 'APPROVED',
      'Brand guidelines': 'APPROVED',
      'Fonts and licences': 'APPROVED',
      'Colour palette': 'APPROVED',
      'Product images': 'APPROVED',
      'Product data': 'APPROVED',
      Sitemap: 'RECEIVED',
      'Approved redirect map': 'REQUESTED',
    },
    scopeCounts: {
      Products: { source: 96, migrated: 96 },
      Variants: { source: 184, migrated: 184 },
      Images: { source: 640, migrated: 640 },
      Collections: { source: 12, migrated: 12 },
    },
    changeRequests: [
      {
        category: 'APPS_INTEGRATIONS',
        label: 'Skin-type quiz with product recommendations',
        amountMinor: 620_000,
        note: 'Agreed as custom scope at kickoff.',
      },
    ],
    approvals: {
      DESIGN: { status: 'PENDING' },
    },
    invoices: [
      {
        milestone: 'Deposit (40%)',
        number: 'AHN-2488',
        amountMinor: 1_260_000,
        paidMinor: 1_260_000,
        status: 'PAID',
        invoiceDaysAgo: 25,
        dueInDays: -11,
        paidDaysAgo: 18,
      },
      {
        milestone: 'Design sign-off (30%)',
        amountMinor: 945_000,
        paidMinor: 0,
        status: 'NOT_INVOICED',
      },
      { milestone: 'Launch (30%)', amountMinor: 945_000, paidMinor: 0, status: 'NOT_INVOICED' },
    ],
    issues: [],
    comments: [
      {
        authorKey: 'pmLinh',
        body: 'Full design set shared: home, collection, PDP, quiz flow and the bundle builder. Feedback consolidated in one round please - a second round pushes the launch date.',
        category: 'DESIGN_FEEDBACK',
        visibility: 'EVERYONE',
        status: 'OPEN',
        daysAgo: 2,
      },
    ],
    nextAction: {
      text: 'Merchant reviews the design set and either approves or consolidates feedback.',
      ownerKey: null,
      ownerTeam: 'MERCHANT',
      dueInDays: 3,
    },
    slackChannel: { id: 'C-SHOPLINE-MIGRATIONS', name: '#shopline-migrations' },
    clickupTask: { id: '86def3311', name: 'Lumen Skincare - custom build' },
    introSentDaysAgo: 26,
    introRespondedDaysAgo: 25,
  },

  // 6 - live, post-launch watch
  {
    code: 'PRJ-0006',
    merchant: {
      name: 'Harbour & Co',
      website: 'https://harbourandco.example',
      storeId: 'SL-85990',
      platform: 'BigCommerce',
      country: 'New Zealand',
      industry: 'Homeware',
      contact: {
        name: 'Sam Whitfield',
        email: 'sam@harbourandco.example',
        phone: '+64 9 555 0166',
        title: 'Ecommerce Lead',
      },
    },
    migrationType: 'ONE_TO_ONE',
    stage: 'DEPLOYED_LIVE',
    startDaysAgo: 41,
    targetInDays: -3,
    pm: 'pmDavid',
    dev: 'devMarcus',
    am: 'slJonas',
    se: 'slDan',
    scopeSummary: '1:1 migration from BigCommerce, launched three days ahead of target.',
    contractTotalMinor: 1_250_000,
    stages: [
      { stage: 'INTRODUCTION', enteredAt: ago(41), exitedAt: ago(40) },
      { stage: 'MERCHANT_CONTACTED', enteredAt: ago(40), exitedAt: ago(39) },
      { stage: 'KICKOFF_SCHEDULED', enteredAt: ago(39), exitedAt: ago(36) },
      { stage: 'WAITING_FOR_ACCESS', enteredAt: ago(36), exitedAt: ago(34) },
      { stage: 'ASSETS_COLLECTION', enteredAt: ago(34), exitedAt: ago(29) },
      { stage: 'MIGRATION', enteredAt: ago(29), exitedAt: ago(23) },
      { stage: 'DESIGN', enteredAt: ago(23), exitedAt: ago(18) },
      { stage: 'MERCHANT_DESIGN_REVIEW', enteredAt: ago(18), exitedAt: ago(15) },
      { stage: 'DEVELOPMENT', enteredAt: ago(15), exitedAt: ago(9) },
      { stage: 'INTERNAL_QA', enteredAt: ago(9), exitedAt: ago(7) },
      { stage: 'MERCHANT_QA', enteredAt: ago(7), exitedAt: ago(5) },
      { stage: 'MIGRATION_VALIDATION', enteredAt: ago(5), exitedAt: ago(4) },
      { stage: 'READY_FOR_SHOPLINE_REVIEW', enteredAt: ago(4), exitedAt: ago(3, 12) },
      { stage: 'SHOPLINE_REVIEW', enteredAt: ago(3, 12), exitedAt: ago(2) },
      { stage: 'READY_FOR_DEPLOYMENT', enteredAt: ago(2), exitedAt: ago(1) },
      { stage: 'DEPLOYED_LIVE', enteredAt: ago(1), exitedAt: null },
    ],
    blockers: [],
    accessOverrides: Object.fromEntries(
      DEFAULT_ACCESS_CHECKLIST.map((item) => [item.label, 'VERIFIED' as AccessStatus]),
    ),
    assetOverrides: Object.fromEntries(
      DEFAULT_ASSET_CHECKLIST.map((item) => [item.label, 'APPROVED' as AssetStatus]),
    ),
    scopeCounts: {
      Products: { source: 274, migrated: 274 },
      Variants: { source: 690, migrated: 690 },
      Images: { source: 1120, migrated: 1120 },
      Customers: { source: 5210, migrated: 5210 },
      Orders: { source: 18400, migrated: 18400 },
      Redirects: { source: 410, migrated: 410 },
    },
    approvals: {
      DESIGN: { status: 'APPROVED', decidedDaysAgo: 15 },
      DEVELOPMENT: { status: 'APPROVED', decidedDaysAgo: 9 },
      QA: { status: 'APPROVED', decidedDaysAgo: 5 },
      MERCHANT_FINAL: { status: 'APPROVED', decidedDaysAgo: 4 },
      SHOPLINE_DEPLOYMENT: {
        status: 'APPROVED',
        decidedDaysAgo: 2,
        notes: 'Approved for the 02:00 UTC window.',
      },
    },
    invoices: [
      {
        milestone: 'Deposit (50%)',
        number: 'AHN-2440',
        amountMinor: 625_000,
        paidMinor: 625_000,
        status: 'PAID',
        invoiceDaysAgo: 38,
        dueInDays: -24,
        paidDaysAgo: 31,
      },
      {
        milestone: 'Launch (50%)',
        number: 'AHN-2510',
        amountMinor: 625_000,
        paidMinor: 300_000,
        status: 'PARTIALLY_PAID',
        invoiceDaysAgo: 1,
        dueInDays: 13,
      },
    ],
    issues: [
      {
        title: 'Google Search Console reporting 12 soft 404s post-launch',
        description:
          'Twelve legacy blog URLs were not in the redirect map and now return the catch-all page.',
        severity: 'MEDIUM',
        status: 'IN_PROGRESS',
        ownerTeam: 'AHN',
        ownerKey: 'devMarcus',
        reporterKey: 'pmDavid',
        reportedDaysAgo: 0,
      },
    ],
    comments: [
      {
        authorKey: 'pmDavid',
        body: 'Store went live at 02:14 UTC. DNS propagated within the hour, checkout tested end to end, tracking confirmed firing. Watching for 5 days before closing.',
        category: 'GENERAL_UPDATE',
        visibility: 'EVERYONE',
        daysAgo: 1,
      },
    ],
    nextAction: {
      text: 'Add the 12 missing blog redirects, then close the post-launch watch period.',
      ownerKey: 'devMarcus',
      ownerTeam: 'AHN',
      dueInDays: 2,
    },
    slackChannel: { id: 'C-SHOPLINE-LAUNCHES', name: '#shopline-launches' },
    clickupTask: { id: '86def1988', name: 'Harbour & Co - SHOPLINE migration' },
    introSentDaysAgo: 40,
    introRespondedDaysAgo: 39,
    handoff: {
      submittedDaysAgo: 4,
      decision: 'APPROVED',
      decidedDaysAgo: 2,
      notes: 'All validation counts matched. Rollback plan documented.',
      decisionNotes: 'Approved. Nice clean package - counts and redirects verified.',
    },
  },

  // 7 - completed, for the averages
  {
    code: 'PRJ-0007',
    merchant: {
      name: 'Copper Lane Bakery',
      website: 'https://copperlane.example',
      storeId: 'SL-81002',
      platform: 'Squarespace',
      country: 'Ireland',
      industry: 'Food & beverage',
      contact: {
        name: 'Aoife Byrne',
        email: 'aoife@copperlane.example',
        phone: '+353 1 555 0121',
        title: 'Owner',
      },
    },
    migrationType: 'ONE_TO_ONE',
    stage: 'COMPLETED',
    startDaysAgo: 78,
    targetInDays: -46,
    completedDaysAgo: 44,
    pm: 'pmLinh',
    dev: 'devAnh',
    am: 'slPriya',
    se: null,
    scopeSummary: 'Small 1:1 migration off Squarespace. Delivered two days ahead of target.',
    contractTotalMinor: 540_000,
    stages: [
      { stage: 'INTRODUCTION', enteredAt: ago(78), exitedAt: ago(77) },
      { stage: 'MERCHANT_CONTACTED', enteredAt: ago(77), exitedAt: ago(76) },
      { stage: 'KICKOFF_SCHEDULED', enteredAt: ago(76), exitedAt: ago(73) },
      { stage: 'WAITING_FOR_ACCESS', enteredAt: ago(73), exitedAt: ago(70) },
      { stage: 'ASSETS_COLLECTION', enteredAt: ago(70), exitedAt: ago(66) },
      { stage: 'MIGRATION', enteredAt: ago(66), exitedAt: ago(62) },
      { stage: 'DESIGN', enteredAt: ago(62), exitedAt: ago(58) },
      { stage: 'MERCHANT_DESIGN_REVIEW', enteredAt: ago(58), exitedAt: ago(56) },
      { stage: 'DEVELOPMENT', enteredAt: ago(56), exitedAt: ago(52) },
      { stage: 'INTERNAL_QA', enteredAt: ago(52), exitedAt: ago(50) },
      { stage: 'MERCHANT_QA', enteredAt: ago(50), exitedAt: ago(49) },
      { stage: 'MIGRATION_VALIDATION', enteredAt: ago(49), exitedAt: ago(48) },
      { stage: 'READY_FOR_SHOPLINE_REVIEW', enteredAt: ago(48), exitedAt: ago(47) },
      { stage: 'SHOPLINE_REVIEW', enteredAt: ago(47), exitedAt: ago(46) },
      { stage: 'READY_FOR_DEPLOYMENT', enteredAt: ago(46), exitedAt: ago(45) },
      { stage: 'DEPLOYED_LIVE', enteredAt: ago(45), exitedAt: ago(44) },
      { stage: 'COMPLETED', enteredAt: ago(44), exitedAt: null },
    ],
    blockers: [],
    accessOverrides: Object.fromEntries(
      DEFAULT_ACCESS_CHECKLIST.map((item) => [item.label, 'VERIFIED' as AccessStatus]),
    ),
    assetOverrides: Object.fromEntries(
      DEFAULT_ASSET_CHECKLIST.map((item) => [item.label, 'APPROVED' as AssetStatus]),
    ),
    approvals: {
      DESIGN: { status: 'APPROVED', decidedDaysAgo: 56 },
      DEVELOPMENT: { status: 'APPROVED', decidedDaysAgo: 52 },
      QA: { status: 'APPROVED', decidedDaysAgo: 49 },
      MERCHANT_FINAL: { status: 'APPROVED', decidedDaysAgo: 48 },
      SHOPLINE_DEPLOYMENT: { status: 'APPROVED', decidedDaysAgo: 46 },
    },
    invoices: [
      {
        milestone: 'Full project',
        number: 'AHN-2380',
        amountMinor: 540_000,
        paidMinor: 540_000,
        status: 'PAID',
        invoiceDaysAgo: 45,
        dueInDays: -31,
        paidDaysAgo: 40,
      },
    ],
    issues: [],
    comments: [
      {
        authorKey: 'pmLinh',
        body: 'Closed out. 44 days from introduction to live, no launch blockers, one design round.',
        category: 'GENERAL_UPDATE',
        visibility: 'AHN_SHOPLINE',
        daysAgo: 44,
      },
    ],
    nextAction: {
      text: 'Nothing - project closed.',
      ownerKey: null,
      ownerTeam: 'OTHER',
      dueInDays: null,
    },
    introSentDaysAgo: 77,
    introRespondedDaysAgo: 76,
    handoff: {
      submittedDaysAgo: 48,
      decision: 'APPROVED',
      decidedDaysAgo: 46,
      notes: 'Small store, straightforward cutover.',
      decisionNotes: 'Approved.',
    },
  },
];

async function main() {
  console.log('Clearing existing data...');
  await clear();

  console.log('Creating organization...');
  // The one agency tenant this demo data belongs to (D-052) - matches the
  // bootstrap row the multi-tenant migration seeds for real deployments, so
  // a fresh `pnpm db:seed` and a migrated existing database end up with the
  // same slug either way.
  const organization = await db.organization.create({
    data: { name: 'AHN Media', slug: 'ahn-media' },
    select: { id: true },
  });

  console.log('Creating users...');
  const userIds = new Map<UserKey, string>();
  for (const spec of USERS) {
    // MERCHANT accounts are scoped by `ProjectMember`, not organization -
    // matches how `inviteMerchantAction` creates one for real.
    const user = await db.user.create({
      data: {
        email: spec.email,
        name: spec.name,
        passwordHash: PASSWORD_HASH,
        role: spec.role,
        team: spec.team,
        title: spec.title,
        lastLoginAt: ago(1),
        organizationId: spec.team === 'MERCHANT' ? null : organization.id,
      },
      select: { id: true },
    });
    userIds.set(spec.key, user.id);
  }
  const id = (key: UserKey) => userIds.get(key)!;

  await db.portalSetting.createMany({
    data: [
      {
        key: 'aging-thresholds',
        value: { attentionDays: 31, delayedDays: 46, criticalDays: 61 },
      },
      { key: 'inactivity-days', value: { days: 7 } },
    ],
  });

  console.log('Creating projects...');
  for (const spec of PROJECTS) {
    const merchant = await db.merchant.create({
      data: {
        name: spec.merchant.name,
        website: spec.merchant.website,
        shoplineStoreId: spec.merchant.storeId,
        currentPlatform: spec.merchant.platform,
        country: spec.merchant.country,
        industry: spec.merchant.industry,
        contacts: {
          create: {
            name: spec.merchant.contact.name,
            email: spec.merchant.contact.email,
            phone: spec.merchant.contact.phone,
            title: spec.merchant.contact.title,
            isPrimary: true,
          },
        },
      },
      select: { id: true },
    });

    const lastComment = spec.comments.reduce(
      (min, comment) => Math.min(min, comment.daysAgo),
      Number.POSITIVE_INFINITY,
    );
    const lastActivityAt =
      spec.stage === 'COMPLETED'
        ? ago(spec.completedDaysAgo ?? 0)
        : ago(Number.isFinite(lastComment) ? Math.min(lastComment, 2) : 2);

    const project = await db.project.create({
      data: {
        code: spec.code,
        organizationId: organization.id,
        merchantId: merchant.id,
        stage: spec.stage,
        migrationType: spec.migrationType,
        scopeSummary: spec.scopeSummary,
        ahnProjectManagerId: id(spec.pm),
        ahnDeveloperId: spec.dev ? id(spec.dev) : null,
        shoplineAmId: id(spec.am),
        shoplineSeId: spec.se ? id(spec.se) : null,
        startDate: ago(spec.startDaysAgo),
        targetLaunchDate: spec.targetInDays === null ? null : ahead(spec.targetInDays),
        actualLaunchDate:
          spec.stage === 'DEPLOYED_LIVE' || spec.stage === 'COMPLETED' ? ago(1) : null,
        completedAt: spec.completedDaysAgo ? ago(spec.completedDaysAgo) : null,
        lastActivityAt,
        contractTotalMinor: spec.contractTotalMinor,
        nextAction: spec.nextAction.text,
        nextActionOwnerId: spec.nextAction.ownerKey ? id(spec.nextAction.ownerKey) : null,
        nextActionOwnerTeam: spec.nextAction.ownerTeam,
        nextActionDueDate:
          spec.nextAction.dueInDays === null ? null : ahead(spec.nextAction.dueInDays),
        deploymentNotes:
          spec.handoff?.notes ?? (spec.stage === 'DEPLOYED_LIVE' ? 'Launched successfully.' : null),
      },
      select: { id: true },
    });

    for (const memberKey of spec.memberKeys ?? []) {
      await db.projectMember.create({
        data: { projectId: project.id, userId: id(memberKey), note: 'Merchant contact' },
      });
    }

    // --- stage history -------------------------------------------------
    await db.stageEvent.createMany({
      data: spec.stages.map((step) => ({
        projectId: project.id,
        stage: step.stage,
        enteredAt: step.enteredAt,
        exitedAt: step.exitedAt,
        durationMs: step.exitedAt
          ? BigInt(step.exitedAt.getTime() - step.enteredAt.getTime())
          : null,
        changedById: id(spec.pm),
        reason: step.reason ?? null,
      })),
    });

    // --- blockers ------------------------------------------------------
    let currentBlockerId: string | null = null;
    for (const blockerSpec of spec.blockers) {
      const last = blockerSpec.ownerships[blockerSpec.ownerships.length - 1]!;
      const blocker = await db.blocker.create({
        data: {
          projectId: project.id,
          category: blockerSpec.category,
          title: blockerSpec.title,
          description: blockerSpec.description,
          ownerTeam: last.team,
          ownerUserId: last.userKey ? id(last.userKey) : null,
          nextAction: blockerSpec.nextAction,
          dueDate: blockerSpec.dueDate ?? null,
          startedAt: blockerSpec.startedAt,
          resolvedAt: blockerSpec.resolvedAt ?? null,
          resolution: blockerSpec.resolution ?? null,
          createdById: id(spec.pm),
          ownerships: {
            create: blockerSpec.ownerships.map((ownership) => ({
              ownerTeam: ownership.team,
              ownerUserId: ownership.userKey ? id(ownership.userKey) : null,
              startedAt: ownership.startedAt,
              endedAt: ownership.endedAt,
              durationMs: ownership.endedAt
                ? BigInt(ownership.endedAt.getTime() - ownership.startedAt.getTime())
                : null,
              note: ownership.note ?? null,
            })),
          },
        },
        select: { id: true, resolvedAt: true },
      });
      if (blocker.resolvedAt === null) currentBlockerId = blocker.id;
    }
    if (currentBlockerId) {
      await db.project.update({
        where: { id: project.id },
        data: { currentBlockerId, health: 'BLOCKED' },
      });
    }

    // --- checklists ----------------------------------------------------
    await db.accessItem.createMany({
      data: DEFAULT_ACCESS_CHECKLIST.map((item, index) => {
        const status = (spec.accessOverrides?.[item.label] ?? 'NOT_REQUESTED') as AccessStatus;
        const requested = status !== 'NOT_REQUESTED';
        const received = status === 'RECEIVED' || status === 'VERIFIED';
        return {
          projectId: project.id,
          kind: item.kind,
          label: item.label,
          status,
          blocking: item.blocking,
          notes: item.hint,
          sortOrder: index,
          requestedAt: requested ? ago(spec.startDaysAgo - 3) : null,
          receivedAt: received ? ago(Math.max(1, spec.startDaysAgo - 10)) : null,
          verifiedAt: status === 'VERIFIED' ? ago(Math.max(1, spec.startDaysAgo - 12)) : null,
        };
      }),
    });

    await db.assetItem.createMany({
      data: DEFAULT_ASSET_CHECKLIST.map((item, index) => {
        const status = (spec.assetOverrides?.[item.label] ?? 'NOT_REQUESTED') as AssetStatus;
        return {
          projectId: project.id,
          kind: item.kind,
          label: item.label,
          status,
          required: item.required,
          notes: item.hint,
          sortOrder: index,
          dueDate: ahead(2),
          receivedAt:
            status === 'RECEIVED' || status === 'APPROVED'
              ? ago(Math.max(1, spec.startDaysAgo - 14))
              : null,
          approvedAt: status === 'APPROVED' ? ago(Math.max(1, spec.startDaysAgo - 15)) : null,
        };
      }),
    });

    await db.scopeItem.createMany({
      data: DEFAULT_SCOPE_TEMPLATE.map((item, index) => {
        const counts = spec.scopeCounts?.[item.label];
        const outOfScope = spec.outOfScope?.includes(item.label);
        const included = item.defaultIn.includes(spec.migrationType) && !outOfScope;
        const status = counts
          ? counts.migrated >= counts.source
            ? ('VERIFIED' as const)
            : counts.migrated > 0
              ? ('IN_PROGRESS' as const)
              : ('NOT_STARTED' as const)
          : ('NOT_STARTED' as const);
        return {
          projectId: project.id,
          category: item.category,
          label: item.label,
          disposition: included ? ('IN_SCOPE' as const) : ('OUT_OF_SCOPE' as const),
          status: included ? status : ('NOT_STARTED' as const),
          sourceCount: counts?.source ?? null,
          migratedCount: counts?.migrated ?? null,
          notes: item.hint,
          sortOrder: index,
        };
      }),
    });

    for (const request of spec.changeRequests ?? []) {
      await db.scopeItem.create({
        data: {
          projectId: project.id,
          category: request.category as never,
          label: request.label,
          disposition: 'CHANGE_REQUEST',
          status: 'IN_PROGRESS',
          changeRequestAmountMinor: request.amountMinor,
          changeRequestApprovedAt: ago(spec.startDaysAgo - 5),
          notes: request.note,
          sortOrder: 99,
        },
      });
    }

    // --- approvals -----------------------------------------------------
    const approvalTypes = [
      'DESIGN',
      'DEVELOPMENT',
      'QA',
      'MERCHANT_FINAL',
      'SHOPLINE_DEPLOYMENT',
    ] as const;
    for (const type of approvalTypes) {
      const entry = spec.approvals[type];
      const status = entry?.status ?? 'NOT_REQUESTED';
      const decided =
        status === 'APPROVED' || status === 'CHANGES_REQUESTED' || status === 'REJECTED';
      const decider =
        type === 'SHOPLINE_DEPLOYMENT' ? spec.am : type === 'MERCHANT_FINAL' ? spec.pm : spec.pm;
      await db.approval.create({
        data: {
          projectId: project.id,
          type,
          status,
          requestedById: status === 'NOT_REQUESTED' ? null : id(spec.pm),
          requestedAt: status === 'NOT_REQUESTED' ? null : ago((entry?.decidedDaysAgo ?? 1) + 1),
          decidedById: decided ? id(decider) : null,
          decidedAt: decided ? ago(entry?.decidedDaysAgo ?? 1) : null,
          notes: entry?.notes ?? null,
        },
      });
    }

    // --- money ---------------------------------------------------------
    await db.invoice.createMany({
      data: spec.invoices.map((invoice, index) => ({
        projectId: project.id,
        number: invoice.number ?? null,
        milestone: invoice.milestone,
        status: invoice.status,
        amountMinor: invoice.amountMinor,
        paidMinor: invoice.paidMinor,
        invoiceDate: invoice.invoiceDaysAgo ? ago(invoice.invoiceDaysAgo) : null,
        dueDate: invoice.dueInDays === undefined ? null : ahead(invoice.dueInDays),
        paidDate: invoice.paidDaysAgo ? ago(invoice.paidDaysAgo) : null,
        sortOrder: index,
      })),
    });

    // --- issues --------------------------------------------------------
    let issueSequence = 0;
    for (const issue of spec.issues) {
      issueSequence += 1;
      await db.issue.create({
        data: {
          projectId: project.id,
          reference: `ISS-${issueSequence}`,
          title: issue.title,
          description: issue.description,
          severity: issue.severity,
          status: issue.status,
          ownerTeam: issue.ownerTeam,
          ownerUserId: issue.ownerKey ? id(issue.ownerKey) : null,
          reportedById: id(issue.reporterKey),
          reportedAt: ago(issue.reportedDaysAgo),
          resolvedAt: issue.resolvedDaysAgo !== undefined ? ago(issue.resolvedDaysAgo) : null,
          resolution: issue.resolution ?? null,
        },
      });
    }

    // --- conversation --------------------------------------------------
    for (const comment of spec.comments) {
      const created = await db.comment.create({
        data: {
          projectId: project.id,
          authorId: id(comment.authorKey),
          body: comment.body,
          category: comment.category,
          visibility: comment.visibility,
          status: comment.status ?? 'NONE',
          source: comment.source ?? 'PORTAL',
          sourceUrl: comment.sourceUrl ?? null,
          createdAt: ago(comment.daysAgo),
        },
        select: { id: true },
      });
      for (const mention of comment.mentions ?? []) {
        await db.commentMention.create({
          data: { commentId: created.id, userId: id(mention) },
        });
      }
    }

    // --- timeline ------------------------------------------------------
    const activity: Prisma.ActivityEventCreateManyInput[] = [
      {
        projectId: project.id,
        type: 'PROJECT_CREATED',
        actorId: id(spec.am),
        summary: `${spec.merchant.name} added to the portal by SHOPLINE.`,
        visibility: 'EVERYONE',
        occurredAt: ago(spec.startDaysAgo),
      },
      ...spec.stages.slice(1).map((step, index) => ({
        projectId: project.id,
        type: 'STAGE_CHANGED' as const,
        actorId: id(spec.pm),
        summary: `Stage moved to ${STAGES[step.stage].label}.`,
        detail: step.reason ?? null,
        visibility: step.reason ? ('AHN_SHOPLINE' as const) : ('EVERYONE' as const),
        occurredAt: step.enteredAt,
        payload: {
          from: spec.stages[index]?.stage ?? null,
          to: step.stage,
        } as Prisma.InputJsonValue,
      })),
    ];

    if (spec.introSentDaysAgo !== undefined) {
      activity.push({
        projectId: project.id,
        type: 'INTRODUCTION_SENT',
        actorId: id(spec.am),
        summary: `Introduction email sent to ${spec.merchant.contact.name}.`,
        visibility: 'EVERYONE',
        occurredAt: ago(spec.introSentDaysAgo),
      });
    }
    if (spec.introRespondedDaysAgo !== undefined) {
      activity.push({
        projectId: project.id,
        type: 'INTRODUCTION_RESPONSE',
        actorId: null,
        summary: `${spec.merchant.contact.name} replied to the introduction.`,
        visibility: 'EVERYONE',
        occurredAt: ago(spec.introRespondedDaysAgo),
      });
    }
    for (const blockerSpec of spec.blockers) {
      activity.push({
        projectId: project.id,
        type: 'BLOCKER_OPENED',
        actorId: id(spec.pm),
        summary: `Blocker opened: ${blockerSpec.title}`,
        visibility:
          blockerSpec.ownerships[0]?.team === 'MERCHANT'
            ? ('EVERYONE' as const)
            : ('AHN_SHOPLINE' as const),
        occurredAt: blockerSpec.startedAt,
      });
      for (const ownership of blockerSpec.ownerships.slice(1)) {
        activity.push({
          projectId: project.id,
          type: 'BLOCKER_OWNER_CHANGED',
          actorId: id(spec.pm),
          summary: `Blocker ownership moved to ${ownership.team}.`,
          detail: ownership.note ?? null,
          occurredAt: ownership.startedAt,
        });
      }
      if (blockerSpec.resolvedAt) {
        activity.push({
          projectId: project.id,
          type: 'BLOCKER_RESOLVED',
          actorId: id(spec.pm),
          summary: `Blocker resolved: ${blockerSpec.title}`,
          detail: blockerSpec.resolution ?? null,
          visibility: 'EVERYONE',
          occurredAt: blockerSpec.resolvedAt,
        });
      }
    }
    await db.activityEvent.createMany({ data: activity });

    // --- introduction email -------------------------------------------
    if (spec.introSentDaysAgo !== undefined) {
      const amUser = USERS.find((user) => user.key === spec.am)!;
      const pmUser = USERS.find((user) => user.key === spec.pm)!;
      const rendered = renderIntroductionEmail({
        merchantName: spec.merchant.name,
        merchantContactName: spec.merchant.contact.name,
        merchantWebsite: spec.merchant.website,
        currentPlatform: spec.merchant.platform,
        shoplineStoreId: spec.merchant.storeId,
        migrationType: spec.migrationType,
        targetLaunchDate: spec.targetInDays === null ? null : ahead(spec.targetInDays),
        shoplineContactName: amUser.name,
        shoplineContactEmail: amUser.email,
        ahnContactName: pmUser.name,
        ahnContactEmail: pmUser.email,
        projectUrl: `http://localhost:3000/projects/${spec.code}`,
        requiredAccess: DEFAULT_ACCESS_CHECKLIST.filter((item) => item.blocking).map(
          (item) => item.label,
        ),
      });

      await db.introductionEmail.create({
        data: {
          projectId: project.id,
          status: spec.introRespondedDaysAgo !== undefined ? 'RESPONDED' : 'SENT',
          subject: rendered.subject,
          bodyText: rendered.text,
          bodyHtml: rendered.html,
          recipients: [
            { name: spec.merchant.contact.name, email: spec.merchant.contact.email },
          ] as Prisma.InputJsonValue,
          sentById: id(spec.am),
          sentAt: ago(spec.introSentDaysAgo),
          respondedAt:
            spec.introRespondedDaysAgo !== undefined ? ago(spec.introRespondedDaysAgo) : null,
          responseNote:
            spec.introRespondedDaysAgo !== undefined
              ? 'Merchant confirmed the primary contact and asked for a kickoff slot.'
              : null,
        },
      });
    }

    // --- integrations --------------------------------------------------
    if (spec.slackChannel) {
      await db.integrationLink.create({
        data: {
          projectId: project.id,
          provider: 'SLACK',
          externalId: spec.slackChannel.id,
          displayName: spec.slackChannel.name,
          externalUrl: `https://slack.example/archives/${spec.slackChannel.id}`,
          lastSyncAt: ago(1),
        },
      });
    }
    if (spec.clickupTask) {
      await db.integrationLink.create({
        data: {
          projectId: project.id,
          provider: 'CLICKUP',
          externalId: spec.clickupTask.id,
          displayName: spec.clickupTask.name,
          externalUrl: `https://app.clickup.com/t/${spec.clickupTask.id}`,
          lastSyncAt: ago(1),
        },
      });
    }

    // --- handoff -------------------------------------------------------
    if (spec.handoff) {
      await db.handoffSubmission.create({
        data: {
          projectId: project.id,
          submittedById: id(spec.pm),
          submittedAt: ago(spec.handoff.submittedDaysAgo),
          checklist: {
            migrationComplete: true,
            designApproved: true,
            developmentComplete: true,
            qaPassed: true,
            merchantApproved: true,
            noOpenBlockers: true,
            accessVerified: true,
          } as Prisma.InputJsonValue,
          deploymentNotes: spec.handoff.notes ?? null,
          decision: spec.handoff.decision,
          decidedById: spec.handoff.decidedDaysAgo !== undefined ? id(spec.am) : null,
          decidedAt:
            spec.handoff.decidedDaysAgo !== undefined ? ago(spec.handoff.decidedDaysAgo) : null,
          decisionNotes: spec.handoff.decisionNotes ?? null,
        },
      });
    }
  }

  // --- a few notifications so the bell is not empty ----------------------
  const sunrise = await db.project.findUniqueOrThrow({ where: { code: 'PRJ-0001' } });
  const nordic = await db.project.findUniqueOrThrow({ where: { code: 'PRJ-0002' } });
  const atlas = await db.project.findUniqueOrThrow({ where: { code: 'PRJ-0003' } });

  await db.notification.createMany({
    data: [
      {
        userId: id('pmLinh'),
        projectId: sunrise.id,
        type: 'LAUNCH_BLOCKER',
        title: 'Launch blocker open on Sunrise Coffee Roasters',
        body: 'Subscription renewal dates shift by one day on import.',
        href: '/projects/PRJ-0001#issues',
        createdAt: ago(0, 3),
      },
      {
        userId: id('pmLinh'),
        projectId: atlas.id,
        type: 'ACCESS_MISSING',
        title: 'Atlas Outdoor Supply has been waiting for access for 48 days',
        body: 'Magento admin access is still not available.',
        href: '/projects/PRJ-0003#access',
        createdAt: ago(0, 8),
      },
      {
        userId: id('slJonas'),
        projectId: nordic.id,
        type: 'SHOPLINE_READY',
        title: 'Nordic Thread is ready for SHOPLINE review',
        body: 'AHN submitted the handoff package yesterday.',
        href: '/projects/PRJ-0002#handoff',
        createdAt: ago(1),
      },
      {
        userId: id('slPriya'),
        projectId: sunrise.id,
        type: 'INVOICE_OVERDUE',
        title: 'Design sign-off invoice overdue on Sunrise Coffee Roasters',
        body: 'AHN-2478 was due 6 days ago.',
        href: '/projects/PRJ-0001#invoices',
        createdAt: ago(0, 12),
      },
      {
        userId: id('merchantSunrise'),
        projectId: sunrise.id,
        type: 'ASSETS_MISSING',
        title: 'The redirect map still needs your approval',
        body: '40 collection URLs need a decision before development can finish.',
        href: '/portal/assets',
        createdAt: ago(0, 6),
      },
    ],
  });

  const counts = {
    users: await db.user.count(),
    projects: await db.project.count(),
    blockers: await db.blocker.count(),
    issues: await db.issue.count(),
    invoices: await db.invoice.count(),
    comments: await db.comment.count(),
    activity: await db.activityEvent.count(),
  };

  console.log('Seed complete:', counts);
  console.log(`\nEvery seeded account uses the password: ${DEMO_PASSWORD}`);
  console.log(
    'Sign in as linh.tran@ahnmedia.example (AHN PM) or priya.raman@shopline.example (SHOPLINE AM).',
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
