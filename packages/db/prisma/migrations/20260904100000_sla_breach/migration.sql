-- CreateEnum
CREATE TYPE "SlaBreachKind" AS ENUM ('STAGE_OVERRUN', 'LAUNCH_OVERRUN');

-- CreateTable
CREATE TABLE "SlaBreach" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "kind" "SlaBreachKind" NOT NULL,
    "stage" "ProjectStage",
    "targetDays" INTEGER,
    "startedAt" TIMESTAMPTZ(3) NOT NULL,
    "resolvedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SlaBreach_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SlaBreach_projectId_startedAt_idx" ON "SlaBreach"("projectId", "startedAt");

-- CreateIndex
CREATE INDEX "SlaBreach_resolvedAt_idx" ON "SlaBreach"("resolvedAt");

-- AddForeignKey
ALTER TABLE "SlaBreach" ADD CONSTRAINT "SlaBreach_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A breach cannot resolve before it started.
ALTER TABLE "SlaBreach"
  ADD CONSTRAINT "SlaBreach_resolved_after_started"
  CHECK ("resolvedAt" IS NULL OR "resolvedAt" >= "startedAt");

-- A stage is set exactly when the breach is a stage overrun.
ALTER TABLE "SlaBreach"
  ADD CONSTRAINT "SlaBreach_stage_matches_kind"
  CHECK (("kind" = 'STAGE_OVERRUN') = ("stage" IS NOT NULL));

-- At most one open stage-overrun breach per project per stage - the same
-- "one open span" guarantee `StageEvent`/`BlockerOwnership` already carry.
CREATE UNIQUE INDEX "SlaBreach_one_open_stage_overrun_per_stage"
  ON "SlaBreach" ("projectId", "stage")
  WHERE "resolvedAt" IS NULL AND "kind" = 'STAGE_OVERRUN';

-- At most one open launch-overrun breach per project.
CREATE UNIQUE INDEX "SlaBreach_one_open_launch_overrun_per_project"
  ON "SlaBreach" ("projectId")
  WHERE "resolvedAt" IS NULL AND "kind" = 'LAUNCH_OVERRUN';
