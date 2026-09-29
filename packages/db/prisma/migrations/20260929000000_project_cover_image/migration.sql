-- A cover image for the project hero. Additive and nullable: existing rows
-- stay valid, and a project without a cover falls back to its storefront
-- capture or a plain backdrop.
ALTER TABLE "Project"
    ADD COLUMN "coverImageKey" TEXT,
    ADD COLUMN "coverImageUpdatedAt" TIMESTAMPTZ(3);
