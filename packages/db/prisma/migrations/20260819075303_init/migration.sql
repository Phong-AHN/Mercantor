-- CreateEnum
CREATE TYPE "Team" AS ENUM ('AHN', 'SHOPLINE', 'MERCHANT', 'OTHER');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('PLATFORM_ADMIN', 'AHN_ADMIN', 'AHN_PROJECT_MANAGER', 'AHN_DEVELOPER', 'SHOPLINE_ADMIN', 'SHOPLINE_ACCOUNT_MANAGER', 'SHOPLINE_SOLUTIONS_ENGINEER', 'MERCHANT');

-- CreateEnum
CREATE TYPE "ProjectStage" AS ENUM ('INTRODUCTION', 'MERCHANT_CONTACTED', 'KICKOFF_SCHEDULED', 'WAITING_FOR_ACCESS', 'ASSETS_COLLECTION', 'MIGRATION', 'DESIGN', 'MERCHANT_DESIGN_REVIEW', 'DEVELOPMENT', 'INTERNAL_QA', 'MERCHANT_QA', 'MIGRATION_VALIDATION', 'READY_FOR_SHOPLINE_REVIEW', 'SHOPLINE_REVIEW', 'READY_FOR_DEPLOYMENT', 'DEPLOYED_LIVE', 'COMPLETED', 'ON_HOLD_BLOCKED');

-- CreateEnum
CREATE TYPE "MigrationType" AS ENUM ('ONE_TO_ONE', 'CUSTOM_BUILD', 'HYBRID');

-- CreateEnum
CREATE TYPE "ProjectHealth" AS ENUM ('ON_TRACK', 'AT_RISK', 'BLOCKED');

-- CreateEnum
CREATE TYPE "BlockerCategory" AS ENUM ('NONE', 'WAITING_ON_MERCHANT', 'WAITING_ON_AHN', 'WAITING_ON_SHOPLINE', 'ACCESS', 'ASSETS', 'DESIGN_APPROVAL', 'TECHNICAL_ANSWER', 'PAYMENT', 'QA', 'DEPLOYMENT', 'SCOPE_CLARIFICATION');

-- CreateEnum
CREATE TYPE "IssueSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'LAUNCH_BLOCKER');

-- CreateEnum
CREATE TYPE "IssueStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'WAITING_ON_OTHERS', 'RESOLVED', 'WONT_FIX');

-- CreateEnum
CREATE TYPE "AccessStatus" AS ENUM ('NOT_REQUESTED', 'REQUESTED', 'RECEIVED', 'VERIFIED', 'ISSUE');

-- CreateEnum
CREATE TYPE "AccessKind" AS ENUM ('SHOPLINE_ADMIN', 'SOURCE_PLATFORM', 'DOMAIN_DNS', 'APPS_INTEGRATIONS', 'PRODUCT_DATA', 'ORDER_DATA', 'CUSTOMER_DATA', 'BRAND_ASSETS', 'PAYMENT_GATEWAY', 'EMAIL_MARKETING', 'ANALYTICS', 'OTHER');

-- CreateEnum
CREATE TYPE "AssetStatus" AS ENUM ('NOT_REQUESTED', 'REQUESTED', 'RECEIVED', 'APPROVED', 'ISSUE');

-- CreateEnum
CREATE TYPE "AssetKind" AS ENUM ('LOGO', 'BRAND_GUIDELINES', 'FONTS', 'COLORS', 'PRODUCT_IMAGES', 'PRODUCT_DATA', 'SITEMAP', 'URL_STRUCTURE', 'REDIRECT_MAP', 'POLICIES', 'SHIPPING_INFO', 'TAX_INFO', 'PAYMENT_INFO', 'LEGAL_INFO', 'STORE_CREDENTIALS', 'OTHER');

-- CreateEnum
CREATE TYPE "ScopeCategory" AS ENUM ('PRODUCTS', 'VARIANTS', 'IMAGES', 'COLLECTIONS', 'CUSTOMERS', 'ORDERS', 'PAGES', 'NAVIGATION', 'POLICIES', 'THEME_DESIGN', 'REDIRECTS', 'APPS_INTEGRATIONS', 'OTHER');

-- CreateEnum
CREATE TYPE "ScopeDisposition" AS ENUM ('IN_SCOPE', 'OUT_OF_SCOPE', 'CHANGE_REQUEST');

-- CreateEnum
CREATE TYPE "ScopeStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'MIGRATED', 'VERIFIED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "CommentCategory" AS ENUM ('GENERAL_UPDATE', 'MERCHANT_REQUEST', 'AHN_QUESTION', 'SHOPLINE_QUESTION', 'TECHNICAL_ISSUE', 'DESIGN_FEEDBACK', 'MIGRATION_ISSUE', 'QA_ISSUE', 'DEPLOYMENT_ISSUE', 'SCOPE_CHANGE');

-- CreateEnum
CREATE TYPE "CommentVisibility" AS ENUM ('INTERNAL_AHN', 'AHN_SHOPLINE', 'EVERYONE');

-- CreateEnum
CREATE TYPE "CommentStatus" AS ENUM ('NONE', 'OPEN', 'IN_PROGRESS', 'RESOLVED');

-- CreateEnum
CREATE TYPE "CommentSource" AS ENUM ('PORTAL', 'SLACK', 'EMAIL', 'CLICKUP');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('NOT_INVOICED', 'INVOICE_SENT', 'PARTIALLY_PAID', 'PAID', 'OVERDUE');

-- CreateEnum
CREATE TYPE "ApprovalType" AS ENUM ('DESIGN', 'DEVELOPMENT', 'QA', 'MERCHANT_FINAL', 'SHOPLINE_DEPLOYMENT');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('NOT_REQUESTED', 'PENDING', 'APPROVED', 'CHANGES_REQUESTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "HandoffDecision" AS ENUM ('PENDING', 'APPROVED', 'CHANGES_REQUESTED', 'ISSUE_REPORTED');

-- CreateEnum
CREATE TYPE "IntroEmailStatus" AS ENUM ('DRAFT', 'SENT', 'RESPONDED', 'BOUNCED');

-- CreateEnum
CREATE TYPE "IntegrationProvider" AS ENUM ('SLACK', 'CLICKUP', 'EMAIL');

-- CreateEnum
CREATE TYPE "OutboxStatus" AS ENUM ('PENDING', 'DELIVERED', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('PROJECT_CREATED', 'STAGE_CHANGED', 'BLOCKER_OPENED', 'BLOCKER_OWNER_CHANGED', 'BLOCKER_RESOLVED', 'COMMENT_POSTED', 'ACCESS_STATUS_CHANGED', 'ASSET_STATUS_CHANGED', 'SCOPE_CHANGED', 'ISSUE_REPORTED', 'ISSUE_RESOLVED', 'APPROVAL_REQUESTED', 'APPROVAL_DECIDED', 'INTRODUCTION_SENT', 'INTRODUCTION_RESPONSE', 'INVOICE_UPDATED', 'HANDOFF_SUBMITTED', 'HANDOFF_DECIDED', 'ASSIGNMENT_CHANGED', 'SLACK_MESSAGE_RECORDED', 'CLICKUP_SYNCED', 'PROJECT_UPDATED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('INTRODUCTION_UNANSWERED', 'ACCESS_MISSING', 'ASSETS_MISSING', 'PROJECT_INACTIVE', 'APPROVAL_PENDING', 'MERCHANT_FEEDBACK', 'TECHNICAL_ASSISTANCE', 'LAUNCH_BLOCKER', 'INVOICE_OVERDUE', 'QA_READY', 'SHOPLINE_READY', 'DEPLOYMENT_APPROVAL', 'MENTIONED', 'ASSIGNED');

-- CreateEnum
CREATE TYPE "AttachmentKind" AS ENUM ('FILE', 'LINK');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "team" "Team" NOT NULL,
    "title" TEXT,
    "phone" TEXT,
    "avatarColor" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Merchant" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "website" TEXT,
    "shoplineStoreId" TEXT,
    "currentPlatform" TEXT,
    "country" TEXT,
    "industry" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Merchant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MerchantContact" (
    "id" UUID NOT NULL,
    "merchantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "title" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "MerchantContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "merchantId" UUID NOT NULL,
    "stage" "ProjectStage" NOT NULL DEFAULT 'INTRODUCTION',
    "migrationType" "MigrationType" NOT NULL DEFAULT 'ONE_TO_ONE',
    "scopeSummary" TEXT,
    "ahnProjectManagerId" UUID,
    "ahnDeveloperId" UUID,
    "shoplineAmId" UUID,
    "shoplineSeId" UUID,
    "startDate" TIMESTAMPTZ(3) NOT NULL,
    "targetLaunchDate" TIMESTAMPTZ(3),
    "actualLaunchDate" TIMESTAMPTZ(3),
    "completedAt" TIMESTAMPTZ(3),
    "lastActivityAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "health" "ProjectHealth" NOT NULL DEFAULT 'ON_TRACK',
    "currentBlockerId" UUID,
    "nextAction" TEXT,
    "nextActionOwnerId" UUID,
    "nextActionOwnerTeam" "Team",
    "nextActionDueDate" TIMESTAMPTZ(3),
    "contractTotalMinor" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "deploymentNotes" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectMember" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StageEvent" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "stage" "ProjectStage" NOT NULL,
    "ownerTeam" "Team",
    "enteredAt" TIMESTAMPTZ(3) NOT NULL,
    "exitedAt" TIMESTAMPTZ(3),
    "durationMs" BIGINT,
    "changedById" UUID,
    "reason" TEXT,

    CONSTRAINT "StageEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Blocker" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "category" "BlockerCategory" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "ownerTeam" "Team" NOT NULL,
    "ownerUserId" UUID,
    "nextAction" TEXT,
    "dueDate" TIMESTAMPTZ(3),
    "startedAt" TIMESTAMPTZ(3) NOT NULL,
    "resolvedAt" TIMESTAMPTZ(3),
    "resolution" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Blocker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BlockerOwnership" (
    "id" UUID NOT NULL,
    "blockerId" UUID NOT NULL,
    "ownerTeam" "Team" NOT NULL,
    "ownerUserId" UUID,
    "startedAt" TIMESTAMPTZ(3) NOT NULL,
    "endedAt" TIMESTAMPTZ(3),
    "durationMs" BIGINT,
    "note" TEXT,

    CONSTRAINT "BlockerOwnership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScopeItem" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "category" "ScopeCategory" NOT NULL,
    "label" TEXT NOT NULL,
    "disposition" "ScopeDisposition" NOT NULL DEFAULT 'IN_SCOPE',
    "status" "ScopeStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "sourceCount" INTEGER,
    "migratedCount" INTEGER,
    "notes" TEXT,
    "changeRequestAmountMinor" INTEGER,
    "changeRequestApprovedAt" TIMESTAMPTZ(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ScopeItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessItem" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "kind" "AccessKind" NOT NULL,
    "label" TEXT NOT NULL,
    "status" "AccessStatus" NOT NULL DEFAULT 'NOT_REQUESTED',
    "blocking" BOOLEAN NOT NULL DEFAULT false,
    "ownerTeam" "Team" NOT NULL DEFAULT 'MERCHANT',
    "requestedAt" TIMESTAMPTZ(3),
    "receivedAt" TIMESTAMPTZ(3),
    "verifiedAt" TIMESTAMPTZ(3),
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AccessItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetItem" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "kind" "AssetKind" NOT NULL,
    "label" TEXT NOT NULL,
    "status" "AssetStatus" NOT NULL DEFAULT 'NOT_REQUESTED',
    "required" BOOLEAN NOT NULL DEFAULT true,
    "dueDate" TIMESTAMPTZ(3),
    "receivedAt" TIMESTAMPTZ(3),
    "approvedAt" TIMESTAMPTZ(3),
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AssetItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "kind" "AttachmentKind" NOT NULL,
    "label" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "storageKey" TEXT,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "uploadedById" UUID,
    "accessItemId" UUID,
    "assetItemId" UUID,
    "commentId" UUID,
    "issueId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Comment" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "parentId" UUID,
    "body" TEXT NOT NULL,
    "category" "CommentCategory" NOT NULL DEFAULT 'GENERAL_UPDATE',
    "visibility" "CommentVisibility" NOT NULL DEFAULT 'AHN_SHOPLINE',
    "status" "CommentStatus" NOT NULL DEFAULT 'NONE',
    "assignedToId" UUID,
    "resolvedAt" TIMESTAMPTZ(3),
    "source" "CommentSource" NOT NULL DEFAULT 'PORTAL',
    "sourceUrl" TEXT,
    "sourceRef" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommentMention" (
    "id" UUID NOT NULL,
    "commentId" UUID NOT NULL,
    "userId" UUID NOT NULL,

    CONSTRAINT "CommentMention_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityEvent" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "type" "ActivityType" NOT NULL,
    "actorId" UUID,
    "summary" TEXT NOT NULL,
    "detail" TEXT,
    "visibility" "CommentVisibility" NOT NULL DEFAULT 'AHN_SHOPLINE',
    "payload" JSONB,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Issue" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "severity" "IssueSeverity" NOT NULL DEFAULT 'MEDIUM',
    "status" "IssueStatus" NOT NULL DEFAULT 'OPEN',
    "ownerTeam" "Team" NOT NULL DEFAULT 'AHN',
    "ownerUserId" UUID,
    "reportedById" UUID,
    "reportedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" TIMESTAMPTZ(3),
    "resolution" TEXT,
    "resolvedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Issue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "number" TEXT,
    "milestone" TEXT NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'NOT_INVOICED',
    "amountMinor" INTEGER NOT NULL DEFAULT 0,
    "paidMinor" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "invoiceDate" TIMESTAMPTZ(3),
    "dueDate" TIMESTAMPTZ(3),
    "paidDate" TIMESTAMPTZ(3),
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Approval" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "type" "ApprovalType" NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'NOT_REQUESTED',
    "requestedById" UUID,
    "requestedAt" TIMESTAMPTZ(3),
    "decidedById" UUID,
    "decidedAt" TIMESTAMPTZ(3),
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Approval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HandoffSubmission" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "submittedById" UUID NOT NULL,
    "submittedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checklist" JSONB NOT NULL,
    "deploymentNotes" TEXT,
    "decision" "HandoffDecision" NOT NULL DEFAULT 'PENDING',
    "decidedById" UUID,
    "decidedAt" TIMESTAMPTZ(3),
    "decisionNotes" TEXT,

    CONSTRAINT "HandoffSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntroductionEmail" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "status" "IntroEmailStatus" NOT NULL DEFAULT 'DRAFT',
    "subject" TEXT NOT NULL,
    "bodyText" TEXT NOT NULL,
    "bodyHtml" TEXT NOT NULL,
    "recipients" JSONB NOT NULL,
    "sentById" UUID,
    "sentAt" TIMESTAMPTZ(3),
    "respondedAt" TIMESTAMPTZ(3),
    "responseNote" TEXT,
    "providerMessageId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "IntroductionEmail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationLink" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "provider" "IntegrationProvider" NOT NULL,
    "externalId" TEXT NOT NULL,
    "externalUrl" TEXT,
    "displayName" TEXT,
    "config" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncAt" TIMESTAMPTZ(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "IntegrationLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboxMessage" (
    "id" UUID NOT NULL,
    "projectId" UUID,
    "provider" "IntegrationProvider" NOT NULL,
    "kind" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "availableAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMPTZ(3),
    "externalRef" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutboxMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "projectId" UUID,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "href" TEXT,
    "readAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dedupeKey" TEXT,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "actorId" UUID,
    "projectId" UUID,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "reason" TEXT,
    "ip" TEXT,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortalSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PortalSetting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "SavedView" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "query" JSONB NOT NULL,
    "isShared" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SavedView_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "User_team_idx" ON "User"("team");

-- CreateIndex
CREATE INDEX "User_deletedAt_idx" ON "User"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE INDEX "Merchant_name_idx" ON "Merchant"("name");

-- CreateIndex
CREATE INDEX "Merchant_shoplineStoreId_idx" ON "Merchant"("shoplineStoreId");

-- CreateIndex
CREATE INDEX "MerchantContact_merchantId_idx" ON "MerchantContact"("merchantId");

-- CreateIndex
CREATE INDEX "MerchantContact_email_idx" ON "MerchantContact"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Project_code_key" ON "Project"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Project_currentBlockerId_key" ON "Project"("currentBlockerId");

-- CreateIndex
CREATE INDEX "Project_stage_idx" ON "Project"("stage");

-- CreateIndex
CREATE INDEX "Project_health_idx" ON "Project"("health");

-- CreateIndex
CREATE INDEX "Project_merchantId_idx" ON "Project"("merchantId");

-- CreateIndex
CREATE INDEX "Project_ahnProjectManagerId_idx" ON "Project"("ahnProjectManagerId");

-- CreateIndex
CREATE INDEX "Project_shoplineAmId_idx" ON "Project"("shoplineAmId");

-- CreateIndex
CREATE INDEX "Project_targetLaunchDate_idx" ON "Project"("targetLaunchDate");

-- CreateIndex
CREATE INDEX "Project_lastActivityAt_idx" ON "Project"("lastActivityAt");

-- CreateIndex
CREATE INDEX "Project_deletedAt_idx" ON "Project"("deletedAt");

-- CreateIndex
CREATE INDEX "ProjectMember_userId_idx" ON "ProjectMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectMember_projectId_userId_key" ON "ProjectMember"("projectId", "userId");

-- CreateIndex
CREATE INDEX "StageEvent_projectId_enteredAt_idx" ON "StageEvent"("projectId", "enteredAt");

-- CreateIndex
CREATE INDEX "StageEvent_projectId_exitedAt_idx" ON "StageEvent"("projectId", "exitedAt");

-- CreateIndex
CREATE INDEX "StageEvent_stage_idx" ON "StageEvent"("stage");

-- CreateIndex
CREATE INDEX "Blocker_projectId_resolvedAt_idx" ON "Blocker"("projectId", "resolvedAt");

-- CreateIndex
CREATE INDEX "Blocker_ownerTeam_idx" ON "Blocker"("ownerTeam");

-- CreateIndex
CREATE INDEX "Blocker_category_idx" ON "Blocker"("category");

-- CreateIndex
CREATE INDEX "BlockerOwnership_blockerId_startedAt_idx" ON "BlockerOwnership"("blockerId", "startedAt");

-- CreateIndex
CREATE INDEX "BlockerOwnership_endedAt_idx" ON "BlockerOwnership"("endedAt");

-- CreateIndex
CREATE INDEX "ScopeItem_projectId_disposition_idx" ON "ScopeItem"("projectId", "disposition");

-- CreateIndex
CREATE UNIQUE INDEX "ScopeItem_projectId_category_label_key" ON "ScopeItem"("projectId", "category", "label");

-- CreateIndex
CREATE INDEX "AccessItem_projectId_status_idx" ON "AccessItem"("projectId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AccessItem_projectId_kind_label_key" ON "AccessItem"("projectId", "kind", "label");

-- CreateIndex
CREATE INDEX "AssetItem_projectId_status_idx" ON "AssetItem"("projectId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AssetItem_projectId_kind_label_key" ON "AssetItem"("projectId", "kind", "label");

-- CreateIndex
CREATE INDEX "Attachment_projectId_idx" ON "Attachment"("projectId");

-- CreateIndex
CREATE INDEX "Attachment_assetItemId_idx" ON "Attachment"("assetItemId");

-- CreateIndex
CREATE INDEX "Attachment_commentId_idx" ON "Attachment"("commentId");

-- CreateIndex
CREATE INDEX "Comment_projectId_createdAt_idx" ON "Comment"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "Comment_projectId_visibility_idx" ON "Comment"("projectId", "visibility");

-- CreateIndex
CREATE INDEX "Comment_status_idx" ON "Comment"("status");

-- CreateIndex
CREATE INDEX "CommentMention_userId_idx" ON "CommentMention"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CommentMention_commentId_userId_key" ON "CommentMention"("commentId", "userId");

-- CreateIndex
CREATE INDEX "ActivityEvent_projectId_occurredAt_idx" ON "ActivityEvent"("projectId", "occurredAt");

-- CreateIndex
CREATE INDEX "ActivityEvent_type_idx" ON "ActivityEvent"("type");

-- CreateIndex
CREATE INDEX "Issue_projectId_status_idx" ON "Issue"("projectId", "status");

-- CreateIndex
CREATE INDEX "Issue_severity_status_idx" ON "Issue"("severity", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Issue_projectId_reference_key" ON "Issue"("projectId", "reference");

-- CreateIndex
CREATE INDEX "Invoice_projectId_status_idx" ON "Invoice"("projectId", "status");

-- CreateIndex
CREATE INDEX "Invoice_dueDate_idx" ON "Invoice"("dueDate");

-- CreateIndex
CREATE INDEX "Approval_status_idx" ON "Approval"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Approval_projectId_type_key" ON "Approval"("projectId", "type");

-- CreateIndex
CREATE INDEX "HandoffSubmission_projectId_submittedAt_idx" ON "HandoffSubmission"("projectId", "submittedAt");

-- CreateIndex
CREATE INDEX "HandoffSubmission_decision_idx" ON "HandoffSubmission"("decision");

-- CreateIndex
CREATE INDEX "IntroductionEmail_projectId_createdAt_idx" ON "IntroductionEmail"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "IntroductionEmail_status_idx" ON "IntroductionEmail"("status");

-- CreateIndex
CREATE INDEX "IntegrationLink_provider_idx" ON "IntegrationLink"("provider");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationLink_projectId_provider_key" ON "IntegrationLink"("projectId", "provider");

-- CreateIndex
CREATE INDEX "OutboxMessage_status_availableAt_idx" ON "OutboxMessage"("status", "availableAt");

-- CreateIndex
CREATE INDEX "OutboxMessage_projectId_idx" ON "OutboxMessage"("projectId");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- CreateIndex
CREATE INDEX "Notification_createdAt_idx" ON "Notification"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_userId_dedupeKey_key" ON "Notification"("userId", "dedupeKey");

-- CreateIndex
CREATE INDEX "AuditLog_projectId_occurredAt_idx" ON "AuditLog"("projectId", "occurredAt");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_occurredAt_idx" ON "AuditLog"("actorId", "occurredAt");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "SavedView_isShared_idx" ON "SavedView"("isShared");

-- CreateIndex
CREATE UNIQUE INDEX "SavedView_ownerId_name_key" ON "SavedView"("ownerId", "name");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantContact" ADD CONSTRAINT "MerchantContact_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_ahnProjectManagerId_fkey" FOREIGN KEY ("ahnProjectManagerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_ahnDeveloperId_fkey" FOREIGN KEY ("ahnDeveloperId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_shoplineAmId_fkey" FOREIGN KEY ("shoplineAmId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_shoplineSeId_fkey" FOREIGN KEY ("shoplineSeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_nextActionOwnerId_fkey" FOREIGN KEY ("nextActionOwnerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_currentBlockerId_fkey" FOREIGN KEY ("currentBlockerId") REFERENCES "Blocker"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StageEvent" ADD CONSTRAINT "StageEvent_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StageEvent" ADD CONSTRAINT "StageEvent_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Blocker" ADD CONSTRAINT "Blocker_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Blocker" ADD CONSTRAINT "Blocker_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Blocker" ADD CONSTRAINT "Blocker_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlockerOwnership" ADD CONSTRAINT "BlockerOwnership_blockerId_fkey" FOREIGN KEY ("blockerId") REFERENCES "Blocker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlockerOwnership" ADD CONSTRAINT "BlockerOwnership_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScopeItem" ADD CONSTRAINT "ScopeItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessItem" ADD CONSTRAINT "AccessItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetItem" ADD CONSTRAINT "AssetItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_accessItemId_fkey" FOREIGN KEY ("accessItemId") REFERENCES "AccessItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_assetItemId_fkey" FOREIGN KEY ("assetItemId") REFERENCES "AssetItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "Comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "Issue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Comment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommentMention" ADD CONSTRAINT "CommentMention_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "Comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommentMention" ADD CONSTRAINT "CommentMention_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityEvent" ADD CONSTRAINT "ActivityEvent_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityEvent" ADD CONSTRAINT "ActivityEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HandoffSubmission" ADD CONSTRAINT "HandoffSubmission_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HandoffSubmission" ADD CONSTRAINT "HandoffSubmission_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HandoffSubmission" ADD CONSTRAINT "HandoffSubmission_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntroductionEmail" ADD CONSTRAINT "IntroductionEmail_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntroductionEmail" ADD CONSTRAINT "IntroductionEmail_sentById_fkey" FOREIGN KEY ("sentById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationLink" ADD CONSTRAINT "IntegrationLink_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboxMessage" ADD CONSTRAINT "OutboxMessage_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedView" ADD CONSTRAINT "SavedView_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
