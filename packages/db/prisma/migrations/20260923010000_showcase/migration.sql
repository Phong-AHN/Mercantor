-- The showcase: headline before/after numbers, design decisions, curated
-- comparison pairs, and the narrative fields the project index leads with.
--
-- Additive only. The columns added to "StorefrontProfile" and "PerfTest" are
-- nullable or defaulted, so existing rows stay valid without a backfill.

-- CreateEnum
CREATE TYPE "EngagementType" AS ENUM ('GLOW_UP', 'PLATFORM_MIGRATION', 'VERSION_UPGRADE');

-- CreateEnum
CREATE TYPE "MetricSource" AS ENUM ('PERFORMANCE_TEST', 'PAGE_COUNT', 'MANUAL');

-- CreateEnum
CREATE TYPE "MetricDirection" AS ENUM ('LOWER_IS_BETTER', 'HIGHER_IS_BETTER', 'NEUTRAL');

-- CreateEnum
CREATE TYPE "DesignDecisionStatus" AS ENUM ('PROPOSED', 'ACCEPTED', 'IMPLEMENTED', 'DECLINED');

-- AlterTable
ALTER TABLE "StorefrontProfile"
    ADD COLUMN "headline" TEXT,
    ADD COLUMN "summary" TEXT,
    ADD COLUMN "engagementType" "EngagementType",
    ADD COLUMN "serviceTags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    ADD COLUMN "destinationBuildLabel" TEXT,
    ADD COLUMN "publishedAt" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "PerfTest" ADD COLUMN "thirdPartyHosts" INTEGER;

-- CreateTable
CREATE TABLE "ShowcaseMetric" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "beforeValue" DOUBLE PRECISION,
    "afterValue" DOUBLE PRECISION,
    "unit" TEXT,
    "direction" "MetricDirection" NOT NULL DEFAULT 'LOWER_IS_BETTER',
    "source" "MetricSource" NOT NULL DEFAULT 'PERFORMANCE_TEST',
    "beforePerfTestId" UUID,
    "afterPerfTestId" UUID,
    "measuredAt" TIMESTAMPTZ(3),
    "enteredById" UUID,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "featured" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ShowcaseMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DesignDecision" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "rationale" TEXT,
    "standardRef" TEXT,
    "appliesTo" TEXT,
    "status" "DesignDecisionStatus" NOT NULL DEFAULT 'PROPOSED',
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "clientVisibleAt" TIMESTAMPTZ(3),
    "decidedById" UUID,
    "decidedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "DesignDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComparisonPair" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "beforeCaptureId" UUID NOT NULL,
    "afterCaptureId" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "afterLabel" TEXT NOT NULL DEFAULT 'AFTER',
    "changeNote" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "clientVisibleAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ComparisonPair_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ShowcaseMetric_projectId_displayOrder_idx" ON "ShowcaseMetric"("projectId", "displayOrder");

-- CreateIndex
CREATE INDEX "DesignDecision_projectId_displayOrder_idx" ON "DesignDecision"("projectId", "displayOrder");

-- CreateIndex
CREATE INDEX "DesignDecision_projectId_status_idx" ON "DesignDecision"("projectId", "status");

-- CreateIndex
CREATE INDEX "ComparisonPair_projectId_displayOrder_idx" ON "ComparisonPair"("projectId", "displayOrder");

-- CreateIndex
CREATE INDEX "ComparisonPair_projectId_featured_idx" ON "ComparisonPair"("projectId", "featured");

-- CreateIndex
CREATE UNIQUE INDEX "ComparisonPair_beforeCaptureId_afterCaptureId_key" ON "ComparisonPair"("beforeCaptureId", "afterCaptureId");

-- AddForeignKey
ALTER TABLE "ShowcaseMetric" ADD CONSTRAINT "ShowcaseMetric_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShowcaseMetric" ADD CONSTRAINT "ShowcaseMetric_beforePerfTestId_fkey" FOREIGN KEY ("beforePerfTestId") REFERENCES "PerfTest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShowcaseMetric" ADD CONSTRAINT "ShowcaseMetric_afterPerfTestId_fkey" FOREIGN KEY ("afterPerfTestId") REFERENCES "PerfTest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShowcaseMetric" ADD CONSTRAINT "ShowcaseMetric_enteredById_fkey" FOREIGN KEY ("enteredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DesignDecision" ADD CONSTRAINT "DesignDecision_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DesignDecision" ADD CONSTRAINT "DesignDecision_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComparisonPair" ADD CONSTRAINT "ComparisonPair_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComparisonPair" ADD CONSTRAINT "ComparisonPair_beforeCaptureId_fkey" FOREIGN KEY ("beforeCaptureId") REFERENCES "PageCapture"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComparisonPair" ADD CONSTRAINT "ComparisonPair_afterCaptureId_fkey" FOREIGN KEY ("afterCaptureId") REFERENCES "PageCapture"("id") ON DELETE CASCADE ON UPDATE CASCADE;
