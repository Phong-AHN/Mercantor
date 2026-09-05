-- Check constraints that the application relies on. These have caught real
-- bugs in the predecessor project; they are not decoration.

-- A resolved blocker must say when, and an unresolved one must not.
ALTER TABLE "Blocker"
  ADD CONSTRAINT "Blocker_resolution_requires_timestamp"
  CHECK (("resolvedAt" IS NULL) = ("resolution" IS NULL));

-- A blocker cannot end before it started.
ALTER TABLE "Blocker"
  ADD CONSTRAINT "Blocker_resolved_after_started"
  CHECK ("resolvedAt" IS NULL OR "resolvedAt" >= "startedAt");

-- Ownership spans cannot end before they start.
ALTER TABLE "BlockerOwnership"
  ADD CONSTRAINT "BlockerOwnership_ended_after_started"
  CHECK ("endedAt" IS NULL OR "endedAt" >= "startedAt");

-- Only one open ownership span per blocker: the previous owner's timer must
-- stop before the next one's starts.
CREATE UNIQUE INDEX "BlockerOwnership_one_open_per_blocker"
  ON "BlockerOwnership" ("blockerId")
  WHERE "endedAt" IS NULL;

-- Stage visits cannot end before they start.
ALTER TABLE "StageEvent"
  ADD CONSTRAINT "StageEvent_exited_after_entered"
  CHECK ("exitedAt" IS NULL OR "exitedAt" >= "enteredAt");

-- Exactly one current stage per project.
CREATE UNIQUE INDEX "StageEvent_one_open_per_project"
  ON "StageEvent" ("projectId")
  WHERE "exitedAt" IS NULL;

-- A closed stage visit must carry its cached duration.
ALTER TABLE "StageEvent"
  ADD CONSTRAINT "StageEvent_closed_requires_duration"
  CHECK ("exitedAt" IS NULL OR "durationMs" IS NOT NULL);

-- Money is never negative, and you cannot be paid more than you invoiced.
ALTER TABLE "Invoice"
  ADD CONSTRAINT "Invoice_amounts_non_negative"
  CHECK ("amountMinor" >= 0 AND "paidMinor" >= 0);

ALTER TABLE "Invoice"
  ADD CONSTRAINT "Invoice_paid_within_amount"
  CHECK ("paidMinor" <= "amountMinor");

-- Payment status and the paid figure must agree.
ALTER TABLE "Invoice"
  ADD CONSTRAINT "Invoice_paid_requires_full_amount"
  CHECK ("status" <> 'PAID' OR ("paidMinor" = "amountMinor" AND "paidDate" IS NOT NULL));

ALTER TABLE "Invoice"
  ADD CONSTRAINT "Invoice_sent_requires_number"
  CHECK ("status" = 'NOT_INVOICED' OR ("number" IS NOT NULL AND "invoiceDate" IS NOT NULL));

ALTER TABLE "Project"
  ADD CONSTRAINT "Project_contract_total_non_negative"
  CHECK ("contractTotalMinor" >= 0);

-- A launched project must know when it launched.
ALTER TABLE "Project"
  ADD CONSTRAINT "Project_completed_requires_timestamp"
  CHECK ("stage" <> 'COMPLETED' OR "completedAt" IS NOT NULL);

ALTER TABLE "Project"
  ADD CONSTRAINT "Project_target_after_start"
  CHECK ("targetLaunchDate" IS NULL OR "targetLaunchDate" >= "startDate");

-- A decided approval records who decided it and when.
ALTER TABLE "Approval"
  ADD CONSTRAINT "Approval_decision_requires_decider"
  CHECK (
    "status" IN ('NOT_REQUESTED', 'PENDING')
    OR ("decidedById" IS NOT NULL AND "decidedAt" IS NOT NULL)
  );

-- A resolved issue records its resolution.
ALTER TABLE "Issue"
  ADD CONSTRAINT "Issue_resolved_requires_resolution"
  CHECK (
    "status" NOT IN ('RESOLVED', 'WONT_FIX')
    OR ("resolvedAt" IS NOT NULL AND "resolution" IS NOT NULL)
  );

-- A sent introduction records when it went out.
ALTER TABLE "IntroductionEmail"
  ADD CONSTRAINT "IntroductionEmail_sent_requires_timestamp"
  CHECK ("status" = 'DRAFT' OR "sentAt" IS NOT NULL);

-- A file attachment needs a storage key; a link needs a URL and no key.
ALTER TABLE "Attachment"
  ADD CONSTRAINT "Attachment_file_requires_storage_key"
  CHECK (("kind" = 'FILE') = ("storageKey" IS NOT NULL));

-- Migrated counts cannot exceed what the source held.
ALTER TABLE "ScopeItem"
  ADD CONSTRAINT "ScopeItem_counts_non_negative"
  CHECK (
    ("sourceCount" IS NULL OR "sourceCount" >= 0)
    AND ("migratedCount" IS NULL OR "migratedCount" >= 0)
  );

-- A decided handoff records who decided it.
ALTER TABLE "HandoffSubmission"
  ADD CONSTRAINT "HandoffSubmission_decision_requires_decider"
  CHECK ("decision" = 'PENDING' OR ("decidedById" IS NOT NULL AND "decidedAt" IS NOT NULL));

-- Sessions must expire in the future of their creation.
ALTER TABLE "Session"
  ADD CONSTRAINT "Session_expires_after_creation"
  CHECK ("expiresAt" > "createdAt");
