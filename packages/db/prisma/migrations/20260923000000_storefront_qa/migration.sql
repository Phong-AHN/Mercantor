-- Storefront QA: crawling, findings, before/after captures, performance.
--
-- Additive only. No existing table is altered and no row is touched: the
-- relation fields added to "Project" and "User" are back-relations, which live
-- in the Prisma schema and not in the database.

-- CreateEnum
CREATE TYPE "StorefrontPlatform" AS ENUM ('SHOPIFY', 'SHOPLINE', 'WOOCOMMERCE', 'MAGENTO', 'BIGCOMMERCE', 'WIX', 'SQUARESPACE', 'CUSTOM', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "StorefrontBuild" AS ENUM ('STANDARD_THEME', 'CUSTOMIZED_THEME', 'CUSTOM_STOREFRONT', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "DetectionState" AS ENUM ('SUGGESTED', 'CONFIRMED', 'CORRECTED');

-- CreateEnum
CREATE TYPE "CrawlTrigger" AS ENUM ('MANUAL', 'SCHEDULED', 'POST_DEPLOY');

-- CreateEnum
CREATE TYPE "CrawlStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PageType" AS ENUM ('HOME', 'COLLECTION', 'PRODUCT', 'CART', 'CHECKOUT', 'SEARCH', 'ACCOUNT', 'BLOG', 'ARTICLE', 'POLICY', 'CONTENT', 'OTHER');

-- CreateEnum
CREATE TYPE "PageState" AS ENUM ('ACCESSIBLE', 'BLOCKED', 'NOT_FOUND', 'ERROR', 'EXCLUDED');

-- CreateEnum
CREATE TYPE "FindingCategory" AS ENUM ('SPELLING', 'GRAMMAR', 'BROKEN_LINK', 'MISSING_IMAGE', 'MISSING_ALT', 'META_TITLE', 'META_DESCRIPTION', 'PLACEHOLDER_TEXT', 'CONTENT_INCONSISTENCY', 'MOBILE_LAYOUT', 'RECOMMENDATION', 'CONSOLE_ERROR', 'NETWORK_ERROR', 'PERFORMANCE', 'OTHER');

-- CreateEnum
CREATE TYPE "FindingSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "FindingStatus" AS ENUM ('NEW', 'REVIEWED', 'IN_PROGRESS', 'READY_FOR_VERIFICATION', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "FindingSource" AS ENUM ('AUTOMATED', 'AI', 'MANUAL');

-- CreateEnum
CREATE TYPE "VerificationResult" AS ENUM ('PASSED', 'FAILED', 'INCONCLUSIVE', 'NOT_POSSIBLE');

-- CreateEnum
CREATE TYPE "CaptureViewport" AS ENUM ('DESKTOP', 'MOBILE');

-- CreateEnum
CREATE TYPE "CapturePhase" AS ENUM ('BEFORE', 'AFTER');

-- CreateEnum
CREATE TYPE "PerfTemplate" AS ENUM ('HOME', 'COLLECTION', 'PRODUCT', 'CART', 'CHECKOUT');

-- CreateTable
CREATE TABLE "StorefrontProfile" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "storefrontUrl" TEXT NOT NULL,
    "destinationUrl" TEXT,
    "sourcePlatform" "StorefrontPlatform" NOT NULL DEFAULT 'UNKNOWN',
    "destinationPlatform" "StorefrontPlatform" NOT NULL DEFAULT 'SHOPLINE',
    "build" "StorefrontBuild" NOT NULL DEFAULT 'UNKNOWN',
    "themeName" TEXT,
    "themeVersion" TEXT,
    "detectionSignals" JSONB,
    "detection" "DetectionState" NOT NULL DEFAULT 'SUGGESTED',
    "detectedAt" TIMESTAMPTZ(3),
    "confirmedById" UUID,
    "confirmedAt" TIMESTAMPTZ(3),
    "detectedApps" JSONB,
    "maxPages" INTEGER NOT NULL DEFAULT 300,
    "includePatterns" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "excludePatterns" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "scanIntervalMinutes" INTEGER,
    "lastScheduledAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "StorefrontProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrawlRun" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "trigger" "CrawlTrigger" NOT NULL DEFAULT 'MANUAL',
    "status" "CrawlStatus" NOT NULL DEFAULT 'QUEUED',
    "requestedById" UUID,
    "startedAt" TIMESTAMPTZ(3),
    "finishedAt" TIMESTAMPTZ(3),
    "sitemapUrl" TEXT,
    "pagesDiscovered" INTEGER NOT NULL DEFAULT 0,
    "pagesScanned" INTEGER NOT NULL DEFAULT 0,
    "pagesUnreachable" INTEGER NOT NULL DEFAULT 0,
    "findingsOpened" INTEGER NOT NULL DEFAULT 0,
    "findingsResolved" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrawlRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StorefrontPage" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "canonicalUrl" TEXT,
    "pageType" "PageType" NOT NULL DEFAULT 'OTHER',
    "pageTypeConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "title" TEXT,
    "state" "PageState" NOT NULL DEFAULT 'ACCESSIBLE',
    "lastHttpStatus" INTEGER,
    "includeInScans" BOOLEAN NOT NULL DEFAULT true,
    "excludedReason" TEXT,
    "firstSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StorefrontPage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PageScan" (
    "id" UUID NOT NULL,
    "crawlRunId" UUID NOT NULL,
    "pageId" UUID NOT NULL,
    "httpStatus" INTEGER,
    "ttfbMs" INTEGER,
    "loadMs" INTEGER,
    "title" TEXT,
    "metaDescription" TEXT,
    "h1" TEXT,
    "wordCount" INTEGER,
    "extractedText" TEXT,
    "imageCount" INTEGER NOT NULL DEFAULT 0,
    "imagesMissingAlt" INTEGER NOT NULL DEFAULT 0,
    "internalLinks" INTEGER NOT NULL DEFAULT 0,
    "brokenLinks" INTEGER NOT NULL DEFAULT 0,
    "consoleErrors" JSONB,
    "failedRequests" JSONB,
    "scannedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PageScan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Finding" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "pageId" UUID,
    "url" TEXT NOT NULL,
    "pageType" "PageType" NOT NULL DEFAULT 'OTHER',
    "category" "FindingCategory" NOT NULL,
    "severity" "FindingSeverity" NOT NULL DEFAULT 'MEDIUM',
    "source" "FindingSource" NOT NULL DEFAULT 'AUTOMATED',
    "detector" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "recommendation" TEXT,
    "evidenceText" TEXT,
    "evidenceContext" JSONB,
    "suggestion" TEXT,
    "evidenceImageKey" TEXT,
    "confidence" INTEGER,
    "status" "FindingStatus" NOT NULL DEFAULT 'NEW',
    "fingerprint" TEXT NOT NULL,
    "assigneeId" UUID,
    "reviewedById" UUID,
    "reviewedAt" TIMESTAMPTZ(3),
    "clientVisibleAt" TIMESTAMPTZ(3),
    "falsePositive" BOOLEAN NOT NULL DEFAULT false,
    "falsePositiveReason" TEXT,
    "firstSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "occurrences" INTEGER NOT NULL DEFAULT 1,
    "verifiedAt" TIMESTAMPTZ(3),
    "verificationResult" "VerificationResult",
    "verificationNote" TEXT,
    "firstCrawlRunId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Finding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FindingComment" (
    "id" UUID NOT NULL,
    "findingId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "clientVisible" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "FindingComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FindingEvent" (
    "id" UUID NOT NULL,
    "findingId" UUID NOT NULL,
    "actorId" UUID,
    "field" TEXT NOT NULL,
    "fromValue" TEXT,
    "toValue" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FindingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PageCapture" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "pageId" UUID,
    "url" TEXT NOT NULL,
    "phase" "CapturePhase" NOT NULL,
    "viewport" "CaptureViewport" NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER,
    "storageKey" TEXT NOT NULL,
    "fileSize" INTEGER,
    "projectStage" "ProjectStage" NOT NULL,
    "changeNote" TEXT,
    "requestedById" UUID,
    "capturedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PageCapture_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PerfTest" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "pageId" UUID,
    "url" TEXT NOT NULL,
    "template" "PerfTemplate" NOT NULL,
    "device" "CaptureViewport" NOT NULL,
    "conditions" JSONB,
    "ttfbMs" INTEGER,
    "fcpMs" INTEGER,
    "lcpMs" INTEGER,
    "tbtMs" INTEGER,
    "cls" DOUBLE PRECISION,
    "loadMs" INTEGER,
    "speedIndexMs" INTEGER,
    "performanceScore" INTEGER,
    "pageWeightBytes" INTEGER,
    "requestCount" INTEGER,
    "thirdPartyRequests" INTEGER,
    "thirdPartyBytes" INTEGER,
    "raw" JSONB,
    "error" TEXT,
    "measuredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PerfTest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StorefrontProfile_projectId_key" ON "StorefrontProfile"("projectId");

-- CreateIndex
CREATE INDEX "CrawlRun_projectId_createdAt_idx" ON "CrawlRun"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "CrawlRun_status_idx" ON "CrawlRun"("status");

-- CreateIndex
CREATE INDEX "StorefrontPage_projectId_pageType_idx" ON "StorefrontPage"("projectId", "pageType");

-- CreateIndex
CREATE INDEX "StorefrontPage_projectId_state_idx" ON "StorefrontPage"("projectId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "StorefrontPage_projectId_url_key" ON "StorefrontPage"("projectId", "url");

-- CreateIndex
CREATE INDEX "PageScan_pageId_scannedAt_idx" ON "PageScan"("pageId", "scannedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PageScan_crawlRunId_pageId_key" ON "PageScan"("crawlRunId", "pageId");

-- CreateIndex
CREATE INDEX "Finding_projectId_status_idx" ON "Finding"("projectId", "status");

-- CreateIndex
CREATE INDEX "Finding_projectId_severity_idx" ON "Finding"("projectId", "severity");

-- CreateIndex
CREATE INDEX "Finding_projectId_category_idx" ON "Finding"("projectId", "category");

-- CreateIndex
CREATE INDEX "Finding_assigneeId_status_idx" ON "Finding"("assigneeId", "status");

-- CreateIndex
CREATE INDEX "Finding_clientVisibleAt_idx" ON "Finding"("clientVisibleAt");

-- CreateIndex
CREATE UNIQUE INDEX "Finding_projectId_reference_key" ON "Finding"("projectId", "reference");

-- CreateIndex
CREATE UNIQUE INDEX "Finding_projectId_fingerprint_key" ON "Finding"("projectId", "fingerprint");

-- CreateIndex
CREATE INDEX "FindingComment_findingId_createdAt_idx" ON "FindingComment"("findingId", "createdAt");

-- CreateIndex
CREATE INDEX "FindingEvent_findingId_createdAt_idx" ON "FindingEvent"("findingId", "createdAt");

-- CreateIndex
CREATE INDEX "PageCapture_projectId_url_viewport_capturedAt_idx" ON "PageCapture"("projectId", "url", "viewport", "capturedAt");

-- CreateIndex
CREATE INDEX "PageCapture_projectId_phase_idx" ON "PageCapture"("projectId", "phase");

-- CreateIndex
CREATE INDEX "PerfTest_projectId_template_device_measuredAt_idx" ON "PerfTest"("projectId", "template", "device", "measuredAt");

-- CreateIndex
CREATE INDEX "PerfTest_projectId_measuredAt_idx" ON "PerfTest"("projectId", "measuredAt");

-- AddForeignKey
ALTER TABLE "StorefrontProfile" ADD CONSTRAINT "StorefrontProfile_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StorefrontProfile" ADD CONSTRAINT "StorefrontProfile_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrawlRun" ADD CONSTRAINT "CrawlRun_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrawlRun" ADD CONSTRAINT "CrawlRun_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StorefrontPage" ADD CONSTRAINT "StorefrontPage_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PageScan" ADD CONSTRAINT "PageScan_crawlRunId_fkey" FOREIGN KEY ("crawlRunId") REFERENCES "CrawlRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PageScan" ADD CONSTRAINT "PageScan_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "StorefrontPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Finding" ADD CONSTRAINT "Finding_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Finding" ADD CONSTRAINT "Finding_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "StorefrontPage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Finding" ADD CONSTRAINT "Finding_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Finding" ADD CONSTRAINT "Finding_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Finding" ADD CONSTRAINT "Finding_firstCrawlRunId_fkey" FOREIGN KEY ("firstCrawlRunId") REFERENCES "CrawlRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FindingComment" ADD CONSTRAINT "FindingComment_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "Finding"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FindingComment" ADD CONSTRAINT "FindingComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FindingEvent" ADD CONSTRAINT "FindingEvent_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "Finding"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FindingEvent" ADD CONSTRAINT "FindingEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PageCapture" ADD CONSTRAINT "PageCapture_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PageCapture" ADD CONSTRAINT "PageCapture_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "StorefrontPage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PageCapture" ADD CONSTRAINT "PageCapture_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerfTest" ADD CONSTRAINT "PerfTest_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerfTest" ADD CONSTRAINT "PerfTest_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "StorefrontPage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
