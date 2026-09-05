-- Where a ClickUp task created from an issue is recorded. Nullable: most
-- issues never get one, and it is set once, never cleared.

-- AlterTable
ALTER TABLE "Issue" ADD COLUMN     "clickUpTaskId" TEXT,
ADD COLUMN     "clickUpTaskUrl" TEXT;
