-- AlterTable: nextActionOwnerTeam changes from a single nullable Team to
-- Team[], so a next step can be owned by more than one team at once.
-- Existing single values become one-element arrays; a null becomes an
-- empty array.
ALTER TABLE "Project" ALTER COLUMN "nextActionOwnerTeam" TYPE "Team"[] USING (
  CASE WHEN "nextActionOwnerTeam" IS NULL THEN ARRAY[]::"Team"[] ELSE ARRAY["nextActionOwnerTeam"]::"Team"[] END
);
ALTER TABLE "Project" ALTER COLUMN "nextActionOwnerTeam" SET DEFAULT ARRAY[]::"Team"[];
