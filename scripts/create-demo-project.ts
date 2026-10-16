/**
 * Creates one fully populated demo project for walking people through the
 * portal: an AHN project manager, a SHOPLINE account manager and a merchant
 * login, with stage history, an open blocker, checklists in every state,
 * scope counts, approvals, invoices, issues, a conversation and the
 * introduction email.
 *
 *   npx tsx scripts/create-demo-project.ts                 # local database
 *   npx tsx scripts/create-demo-project.ts --production    # .env.production.local
 *
 * Writes straight to the database, so nothing is sent: no email, no Slack
 * message, no ClickUp task, no integration link. Refuses to run twice (the
 * merchant name is the key). On production it also reactivates the SHOPLINE
 * demo login if it was switched off, since the demo needs it to sign in.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

const PRODUCTION = process.argv.includes('--production');
const ROOT = path.resolve(__dirname, '..');

// Overridable so the script can be tried against a local seed first.
const ACCOUNTS = {
  pm: process.env.DEMO_PM_EMAIL ?? 'ahn@demo.com',
  am: process.env.DEMO_AM_EMAIL ?? 'shopline@demo.com',
  merchant: process.env.DEMO_MERCHANT_EMAIL ?? 'merchant@demo.com',
};
const MERCHANT_NAME = 'Maple & Thread Apparel (Demo)';
const DAY = 86_400_000;

async function main() {
  if (PRODUCTION) {
    // Before @relay/db loads: its own .env loading never overrides a value
    // that is already set, so every query below goes to production.
    const env = readFileSync(path.join(ROOT, '.env.production.local'), 'utf8');
    for (const key of ['DATABASE_URL', 'DIRECT_URL']) {
      const line = env.split(/\r?\n/).find((entry) => entry.startsWith(`${key}=`));
      if (line) process.env[key] = line.slice(key.length + 1).replace(/^"|"$/g, '');
    }
  }
  const { db } = await import('../packages/db/src/index');
  const core = await import('../packages/core/src/index');
  const { DEFAULT_ACCESS_CHECKLIST, DEFAULT_ASSET_CHECKLIST, DEFAULT_SCOPE_TEMPLATE, STAGES } =
    core;

  const now = Date.now();
  const ago = (days: number) => new Date(now - days * DAY);
  // Calendar dates (launch, due dates) are midnight UTC, the way the app's
  // date inputs store them.
  const ahead = (days: number) => {
    const date = new Date(now + days * DAY);
    date.setUTCHours(0, 0, 0, 0);
    return date;
  };

  const target = new URL(process.env.DATABASE_URL ?? 'postgresql://unset').hostname;
  console.log(
    `Target database: ${PRODUCTION ? 'PRODUCTION' : 'local'} (${target.replace(/^[^.]+/, '***')})`,
  );

  try {
    const users = await db.user.findMany({
      where: { email: { in: Object.values(ACCOUNTS) }, deletedAt: null },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        organizationId: true,
        isActive: true,
      },
    });
    const byEmail = (email: string) => {
      const user = users.find((entry) => entry.email === email);
      if (!user) throw new Error(`${email} does not exist here.`);
      return user;
    };
    const pm = byEmail(ACCOUNTS.pm);
    const am = byEmail(ACCOUNTS.am);
    const merchantUser = byEmail(ACCOUNTS.merchant);
    if (merchantUser.role !== 'MERCHANT')
      throw new Error(`${ACCOUNTS.merchant} is not a merchant account.`);
    if (!pm.organizationId || pm.organizationId !== am.organizationId) {
      throw new Error('The AHN and SHOPLINE demo accounts must be in the same organization.');
    }
    const organizationId = pm.organizationId;

    if (
      await db.project.findFirst({ where: { merchant: { name: MERCHANT_NAME }, deletedAt: null } })
    ) {
      console.log(`"${MERCHANT_NAME}" already exists - nothing to do.`);
      return;
    }

    // The next free PRJ-#### code.
    const codes = await db.project.findMany({ select: { code: true } });
    const highest = Math.max(0, ...codes.map(({ code }) => Number(code.replace(/\D/g, '')) || 0));
    const code = `PRJ-${String(highest + 1).padStart(4, '0')}`;

    const stages = [
      { stage: 'INTRODUCTION', enteredAt: ago(41), exitedAt: ago(40) },
      { stage: 'MERCHANT_CONTACTED', enteredAt: ago(40), exitedAt: ago(38) },
      { stage: 'KICKOFF_SCHEDULED', enteredAt: ago(38), exitedAt: ago(35) },
      { stage: 'WAITING_FOR_ACCESS', enteredAt: ago(35), exitedAt: ago(29) },
      { stage: 'ASSETS_COLLECTION', enteredAt: ago(29), exitedAt: ago(23) },
      { stage: 'MIGRATION', enteredAt: ago(23), exitedAt: ago(17) },
      { stage: 'DESIGN', enteredAt: ago(17), exitedAt: ago(11) },
      { stage: 'MERCHANT_DESIGN_REVIEW', enteredAt: ago(11), exitedAt: ago(5) },
      { stage: 'DEVELOPMENT', enteredAt: ago(5), exitedAt: null },
    ] as const;

    const access: Record<string, 'VERIFIED' | 'RECEIVED' | 'REQUESTED' | 'ISSUE'> = {
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
    };
    const assets: Record<string, 'APPROVED' | 'RECEIVED' | 'REQUESTED'> = {
      'Logo files': 'APPROVED',
      'Brand guidelines': 'APPROVED',
      'Fonts and licences': 'APPROVED',
      'Colour palette': 'APPROVED',
      'Product images': 'APPROVED',
      'Product data': 'APPROVED',
      Sitemap: 'APPROVED',
      'URL structure': 'APPROVED',
      'Approved redirect map': 'REQUESTED',
      'Store policies': 'APPROVED',
      'Shipping configuration': 'RECEIVED',
      'Tax configuration': 'REQUESTED',
      'Payment configuration': 'APPROVED',
      'Legal entity information': 'APPROVED',
      'Store credentials handover': 'APPROVED',
    };
    const counts: Record<string, { source: number; migrated: number }> = {
      Products: { source: 312, migrated: 312 },
      Variants: { source: 1180, migrated: 1180 },
      Images: { source: 1940, migrated: 1925 },
      Collections: { source: 26, migrated: 26 },
      Customers: { source: 9640, migrated: 9640 },
      Orders: { source: 28410, migrated: 27100 },
      Pages: { source: 18, migrated: 18 },
      Redirects: { source: 860, migrated: 0 },
    };

    const result = await db.$transaction(async (tx) => {
      if (PRODUCTION && !am.isActive) {
        await tx.user.update({ where: { id: am.id }, data: { isActive: true } });
      }

      const merchant = await tx.merchant.create({
        data: {
          name: MERCHANT_NAME,
          website: 'https://maplethread.example',
          shoplineStoreId: 'SL-DEMO-4127',
          currentPlatform: 'Shopify',
          country: 'United States',
          industry: 'Fashion & apparel',
          notes: 'Demo project for walkthroughs. Not a real merchant.',
          contacts: {
            create: {
              name: merchantUser.name,
              email: merchantUser.email,
              phone: '+1 503 555 0187',
              title: 'Founder',
              isPrimary: true,
            },
          },
        },
        select: { id: true },
      });

      const project = await tx.project.create({
        data: {
          code,
          organizationId,
          merchantId: merchant.id,
          stage: 'DEVELOPMENT',
          migrationType: 'HYBRID',
          scopeSummary:
            '1:1 migration of the catalogue, customers and order history, plus a redesigned home and product page and a size-guide app replacement.',
          deploymentNotes: null,
          ahnProjectManagerId: pm.id,
          shoplineAmId: am.id,
          startDate: ago(41),
          targetLaunchDate: ahead(16),
          lastActivityAt: ago(1),
          contractTotalMinor: 1_850_000,
          nextAction:
            'Merchant approves the redirect list so development can finish the redirects.',
          nextActionOwnerTeam: ['MERCHANT'],
          nextActionDueDate: ahead(2),
          health: 'BLOCKED',
        },
        select: { id: true },
      });

      await tx.projectMember.create({
        data: { projectId: project.id, userId: merchantUser.id, note: 'Merchant contact' },
      });

      await tx.stageEvent.createMany({
        data: stages.map((step) => ({
          projectId: project.id,
          stage: step.stage,
          enteredAt: step.enteredAt,
          exitedAt: step.exitedAt,
          durationMs: step.exitedAt
            ? BigInt(step.exitedAt.getTime() - step.enteredAt.getTime())
            : null,
          changedById: pm.id,
        })),
      });

      // One open blocker with the merchant, one already solved by SHOPLINE.
      const open = await tx.blocker.create({
        data: {
          projectId: project.id,
          category: 'ASSETS',
          title: 'Waiting on the approved redirect list for 860 old page addresses',
          description:
            'AHN matched every old product and collection address to its new one. The merchant needs to confirm the 22 collection addresses that changed name before development can finish the redirects.',
          ownerTeam: 'MERCHANT',
          nextAction: 'Merchant to review and approve the redirect spreadsheet.',
          dueDate: ahead(2),
          startedAt: ago(3),
          createdById: pm.id,
          ownerships: {
            create: [
              {
                ownerTeam: 'AHN',
                ownerUserId: pm.id,
                startedAt: ago(3),
                endedAt: ago(2),
                durationMs: BigInt(DAY),
                note: 'Preparing the redirect list.',
              },
              {
                ownerTeam: 'MERCHANT',
                startedAt: ago(2),
                endedAt: null,
                note: 'Sent to the merchant for approval.',
              },
            ],
          },
        },
        select: { id: true },
      });
      await tx.blocker.create({
        data: {
          projectId: project.id,
          category: 'TECHNICAL_ANSWER',
          title: 'Size-guide app has no SHOPLINE version',
          description:
            'The current size-guide app is Shopify-only. Needed a SHOPLINE-supported replacement.',
          ownerTeam: 'SHOPLINE',
          ownerUserId: am.id,
          nextAction: 'SHOPLINE to recommend an app.',
          startedAt: ago(14),
          resolvedAt: ago(10),
          resolution:
            'SHOPLINE recommended a native size-chart app; AHN configured it in the build.',
          createdById: pm.id,
          ownerships: {
            create: [
              {
                ownerTeam: 'SHOPLINE',
                ownerUserId: am.id,
                startedAt: ago(14),
                endedAt: ago(10),
                durationMs: BigInt(4 * DAY),
              },
            ],
          },
        },
      });
      await tx.project.update({ where: { id: project.id }, data: { currentBlockerId: open.id } });

      await tx.accessItem.createMany({
        data: DEFAULT_ACCESS_CHECKLIST.map((item, index) => {
          const status = access[item.label] ?? 'NOT_REQUESTED';
          const received = status === 'RECEIVED' || status === 'VERIFIED';
          return {
            projectId: project.id,
            kind: item.kind,
            label: item.label,
            status,
            blocking: item.blocking,
            notes: item.hint,
            sortOrder: index,
            requestedAt: status === 'NOT_REQUESTED' ? null : ago(35),
            receivedAt: received ? ago(31) : null,
            verifiedAt: status === 'VERIFIED' ? ago(30) : null,
          };
        }),
      });
      await tx.assetItem.createMany({
        data: DEFAULT_ASSET_CHECKLIST.map((item, index) => {
          const status = assets[item.label] ?? 'NOT_REQUESTED';
          return {
            projectId: project.id,
            kind: item.kind,
            label: item.label,
            status,
            required: item.required,
            notes: item.hint,
            sortOrder: index,
            dueDate: ahead(3),
            receivedAt: status === 'RECEIVED' || status === 'APPROVED' ? ago(26) : null,
            approvedAt: status === 'APPROVED' ? ago(25) : null,
          };
        }),
      });
      await tx.scopeItem.createMany({
        data: DEFAULT_SCOPE_TEMPLATE.map((item, index) => {
          const count = counts[item.label];
          const included = item.defaultIn.includes('HYBRID');
          const status = !count
            ? ('NOT_STARTED' as const)
            : count.migrated >= count.source
              ? ('VERIFIED' as const)
              : count.migrated > 0
                ? ('IN_PROGRESS' as const)
                : ('NOT_STARTED' as const);
          return {
            projectId: project.id,
            category: item.category,
            label: item.label,
            disposition: included ? ('IN_SCOPE' as const) : ('OUT_OF_SCOPE' as const),
            status: included ? status : ('NOT_STARTED' as const),
            sourceCount: count?.source ?? null,
            migratedCount: count?.migrated ?? null,
            notes: item.hint,
            sortOrder: index,
          };
        }),
      });
      await tx.scopeItem.create({
        data: {
          projectId: project.id,
          category: 'APPS_INTEGRATIONS',
          label: 'Gift-wrap option at checkout',
          disposition: 'CHANGE_REQUEST',
          status: 'IN_PROGRESS',
          changeRequestAmountMinor: 150_000,
          changeRequestApprovedAt: ago(9),
          notes: 'Requested during design review. Priced and approved.',
          sortOrder: 99,
        },
      });

      for (const [type, status, decided] of [
        ['DESIGN', 'APPROVED', 5],
        ['DEVELOPMENT', 'NOT_REQUESTED', null],
        ['QA', 'NOT_REQUESTED', null],
        ['MERCHANT_FINAL', 'NOT_REQUESTED', null],
        ['SHOPLINE_DEPLOYMENT', 'NOT_REQUESTED', null],
      ] as const) {
        await tx.approval.create({
          data: {
            projectId: project.id,
            type,
            status,
            requestedById: decided === null ? null : pm.id,
            requestedAt: decided === null ? null : ago(decided + 2),
            decidedById: decided === null ? null : pm.id,
            decidedAt: decided === null ? null : ago(decided),
            notes:
              decided === null ? null : 'Approved after one round of changes to the home page.',
          },
        });
      }

      await tx.invoice.createMany({
        data: [
          {
            projectId: project.id,
            number: 'AHN-DEMO-01',
            milestone: 'Deposit (40%)',
            status: 'PAID',
            amountMinor: 740_000,
            paidMinor: 740_000,
            invoiceDate: ago(40),
            dueDate: ago(26),
            paidDate: ago(30),
            sortOrder: 0,
          },
          {
            projectId: project.id,
            number: 'AHN-DEMO-02',
            milestone: 'Design sign-off (30%)',
            status: 'INVOICE_SENT',
            amountMinor: 555_000,
            paidMinor: 0,
            invoiceDate: ago(4),
            dueDate: ahead(10),
            sortOrder: 1,
          },
          {
            projectId: project.id,
            milestone: 'Launch (30%)',
            status: 'NOT_INVOICED',
            amountMinor: 555_000,
            paidMinor: 0,
            sortOrder: 2,
          },
        ],
      });

      await tx.issue.createMany({
        data: [
          {
            projectId: project.id,
            reference: 'ISS-1',
            title: 'Some product images are cropped on mobile',
            description:
              '15 lifestyle images were uploaded in a wide format and crop badly on phones.',
            severity: 'MEDIUM',
            status: 'IN_PROGRESS',
            ownerTeam: 'AHN',
            ownerUserId: pm.id,
            reportedById: merchantUser.id,
            reportedAt: ago(3),
          },
          {
            projectId: project.id,
            reference: 'ISS-2',
            title: 'Old discount codes did not carry over',
            description:
              'Discount codes are not part of the export; they need to be recreated on SHOPLINE.',
            severity: 'LOW',
            status: 'RESOLVED',
            ownerTeam: 'AHN',
            ownerUserId: pm.id,
            reportedById: am.id,
            reportedAt: ago(12),
            resolvedAt: ago(8),
            resolution: 'AHN recreated the 9 active codes on SHOPLINE.',
          },
        ],
      });

      const comments = [
        {
          authorId: am.id,
          daysAgo: 39,
          visibility: 'EVERYONE',
          category: 'GENERAL_UPDATE',
          status: 'NONE',
          body: `Welcome aboard! AHN Media will handle your move to SHOPLINE. Your project manager and I are both on this thread - ask us anything here.`,
        },
        {
          authorId: merchantUser.id,
          daysAgo: 12,
          visibility: 'EVERYONE',
          category: 'DESIGN_FEEDBACK',
          status: 'RESOLVED',
          body: 'Love the new home page. Could the bestsellers row sit above the brand story?',
        },
        {
          authorId: am.id,
          daysAgo: 11,
          visibility: 'EVERYONE',
          category: 'GENERAL_UPDATE',
          status: 'NONE',
          body: 'Passed this to the design team - the bestsellers row has been moved up in the latest version.',
        },
        {
          authorId: merchantUser.id,
          daysAgo: 2,
          visibility: 'EVERYONE',
          category: 'MERCHANT_REQUEST',
          status: 'OPEN',
          body: 'What exactly do I need to check in the redirect list? Is it just the collection names?',
        },
        {
          authorId: am.id,
          daysAgo: 1,
          visibility: 'EVERYONE',
          category: 'GENERAL_UPDATE',
          status: 'NONE',
          body: 'Yes - only the 22 rows highlighted in yellow. Each one shows the old address and the new one; just confirm they point to the right collection.',
        },
        {
          authorId: pm.id,
          daysAgo: 1,
          visibility: 'INTERNAL_AHN',
          category: 'GENERAL_UPDATE',
          status: 'NONE',
          body: 'Internal: if the redirect list is not back by Friday, launch moves by a few days. Development is otherwise on track.',
        },
      ] as const;
      for (const comment of comments) {
        await tx.comment.create({
          data: {
            projectId: project.id,
            authorId: comment.authorId,
            body: comment.body,
            category: comment.category,
            visibility: comment.visibility,
            status: comment.status,
            resolvedAt: comment.status === 'RESOLVED' ? ago(comment.daysAgo - 1) : null,
            createdAt: ago(comment.daysAgo),
          },
        });
      }

      await tx.activityEvent.createMany({
        data: [
          {
            projectId: project.id,
            type: 'PROJECT_CREATED',
            actorId: am.id,
            summary: `${MERCHANT_NAME} added to the portal by SHOPLINE.`,
            visibility: 'EVERYONE',
            occurredAt: ago(41),
          },
          {
            projectId: project.id,
            type: 'INTRODUCTION_SENT',
            actorId: am.id,
            summary: `Introduction email sent to ${merchantUser.name}.`,
            visibility: 'EVERYONE',
            occurredAt: ago(40),
          },
          {
            projectId: project.id,
            type: 'INTRODUCTION_RESPONSE',
            actorId: null,
            summary: `${merchantUser.name} replied to the introduction.`,
            visibility: 'EVERYONE',
            occurredAt: ago(38),
          },
          ...stages.slice(1).map((step, index) => ({
            projectId: project.id,
            type: 'STAGE_CHANGED' as const,
            actorId: pm.id,
            summary: `Stage moved to ${STAGES[step.stage].label}.`,
            visibility: 'EVERYONE' as const,
            occurredAt: step.enteredAt,
            payload: { from: stages[index]!.stage, to: step.stage },
          })),
          {
            projectId: project.id,
            type: 'BLOCKER_OPENED',
            actorId: pm.id,
            summary: 'Blocker opened: Size-guide app has no SHOPLINE version',
            visibility: 'AHN_SHOPLINE',
            occurredAt: ago(14),
          },
          {
            projectId: project.id,
            type: 'BLOCKER_RESOLVED',
            actorId: pm.id,
            summary: 'Blocker resolved: Size-guide app has no SHOPLINE version',
            visibility: 'EVERYONE',
            occurredAt: ago(10),
          },
          {
            projectId: project.id,
            type: 'APPROVAL_DECIDED',
            actorId: pm.id,
            summary: 'Design approved.',
            visibility: 'EVERYONE',
            occurredAt: ago(5),
          },
          {
            projectId: project.id,
            type: 'BLOCKER_OPENED',
            actorId: pm.id,
            summary:
              'Blocker opened: Waiting on the approved redirect list for 860 old page addresses',
            visibility: 'EVERYONE',
            occurredAt: ago(3),
          },
        ],
      });

      const rendered = core.renderIntroductionEmail({
        merchantName: MERCHANT_NAME,
        merchantContactName: merchantUser.name,
        merchantWebsite: 'https://maplethread.example',
        currentPlatform: 'Shopify',
        shoplineStoreId: 'SL-DEMO-4127',
        migrationType: 'HYBRID',
        targetLaunchDate: ahead(16),
        shoplineContactName: am.name,
        shoplineContactEmail: am.email,
        ahnContactName: pm.name,
        ahnContactEmail: pm.email,
        projectUrl: `${PRODUCTION ? 'https://www.mercantor.co' : 'http://localhost:3000'}/projects/${code}`,
        requiredAccess: DEFAULT_ACCESS_CHECKLIST.filter((item) => item.blocking).map(
          (item) => item.label,
        ),
      });
      await tx.introductionEmail.create({
        data: {
          projectId: project.id,
          status: 'RESPONDED',
          subject: rendered.subject,
          bodyText: rendered.text,
          bodyHtml: rendered.html,
          recipients: [{ name: merchantUser.name, email: merchantUser.email }],
          sentById: am.id,
          sentAt: ago(40),
          respondedAt: ago(38),
          responseNote: 'Replied with a kickoff time.',
        },
      });

      return { code, projectId: project.id };
    });

    console.log(`Created ${result.code} "${MERCHANT_NAME}"`);
    console.log(`  AHN project manager:      ${pm.name} <${pm.email}>`);
    console.log(
      `  SHOPLINE account manager: ${am.name} <${am.email}>${PRODUCTION && !am.isActive ? ' (reactivated)' : ''}`,
    );
    console.log(`  Merchant portal login:    ${merchantUser.name} <${merchantUser.email}>`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
