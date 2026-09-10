-- CreateEnum
CREATE TYPE "BankTransactionSource" AS ENUM ('VIETINBANK');

-- CreateEnum
CREATE TYPE "BankTransactionStatus" AS ENUM ('SUCCESS', 'FAILED', 'PENDING', 'UNKNOWN');

-- CreateTable
CREATE TABLE "BankTransaction" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "projectId" UUID,
    "invoiceId" UUID,
    "source" "BankTransactionSource" NOT NULL DEFAULT 'VIETINBANK',
    "direction" TEXT,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'VND',
    "recipientName" TEXT,
    "recipientBank" TEXT,
    "recipientAccountNumber" TEXT,
    "content" TEXT,
    "transactionRef" TEXT,
    "status" "BankTransactionStatus" NOT NULL DEFAULT 'UNKNOWN',
    "occurredAt" TIMESTAMPTZ(3),
    "rawText" TEXT NOT NULL,
    "screenshotUrl" TEXT,
    "importedById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BankTransaction_organizationId_occurredAt_idx" ON "BankTransaction"("organizationId", "occurredAt");

-- CreateIndex
CREATE INDEX "BankTransaction_projectId_idx" ON "BankTransaction"("projectId");

-- CreateIndex
CREATE INDEX "BankTransaction_invoiceId_idx" ON "BankTransaction"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "BankTransaction_organizationId_transactionRef_key" ON "BankTransaction"("organizationId", "transactionRef");

-- AddForeignKey
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_importedById_fkey" FOREIGN KEY ("importedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

