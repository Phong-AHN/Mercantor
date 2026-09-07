-- CreateTable
CREATE TABLE "Organization" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationIntegration" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "provider" "IntegrationProvider" NOT NULL,
    "encryptedConfig" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "configuredById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "OrganizationIntegration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- CreateIndex
CREATE INDEX "OrganizationIntegration_organizationId_idx" ON "OrganizationIntegration"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationIntegration_organizationId_provider_key" ON "OrganizationIntegration"("organizationId", "provider");

-- AlterTable: add nullable first - existing rows get backfilled below before
-- Project.organizationId is tightened to NOT NULL.
ALTER TABLE "User" ADD COLUMN "organizationId" UUID;
ALTER TABLE "Project" ADD COLUMN "organizationId" UUID;

-- Backfill: every organization that existed before this migration was
-- implicitly "AHN Media" - this makes that explicit as the first row in the
-- table it should always have been, rather than a special case.
INSERT INTO "Organization" ("id", "name", "slug", "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'AHN Media', 'ahn-media', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

UPDATE "Project"
SET "organizationId" = (SELECT "id" FROM "Organization" WHERE "slug" = 'ahn-media')
WHERE "organizationId" IS NULL;

-- PLATFORM_ADMIN (the SaaS operator, not a tenant) and MERCHANT (scoped by
-- ProjectMember, never by organization) stay NULL on purpose - see the
-- column's own comment in schema.prisma.
UPDATE "User"
SET "organizationId" = (SELECT "id" FROM "Organization" WHERE "slug" = 'ahn-media')
WHERE "role" NOT IN ('PLATFORM_ADMIN', 'MERCHANT') AND "organizationId" IS NULL;

-- AlterTable: now safe to require it - every existing project was backfilled
-- above, and every new one is created with an organizationId from the start.
ALTER TABLE "Project" ALTER COLUMN "organizationId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "User_organizationId_idx" ON "User"("organizationId");

-- CreateIndex
CREATE INDEX "Project_organizationId_idx" ON "Project"("organizationId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationIntegration" ADD CONSTRAINT "OrganizationIntegration_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationIntegration" ADD CONSTRAINT "OrganizationIntegration_configuredById_fkey" FOREIGN KEY ("configuredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
