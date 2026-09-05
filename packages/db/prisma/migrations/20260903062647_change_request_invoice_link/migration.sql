-- Links an approved change request to the invoice line it became. Nullable
-- and at most one per scope item: most scope items are never a change
-- request, and a change request is priced and approved before it has one.

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "scopeItemId" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_scopeItemId_key" ON "Invoice"("scopeItemId");

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_scopeItemId_fkey" FOREIGN KEY ("scopeItemId") REFERENCES "ScopeItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
