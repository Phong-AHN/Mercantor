-- AlterTable
ALTER TABLE "OrganizationIntegration" ADD COLUMN     "externalWebhookId" TEXT;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "clickUpTrackedStages" "ProjectStage"[] DEFAULT ARRAY[]::"ProjectStage"[];

-- CreateIndex
CREATE INDEX "OrganizationIntegration_externalWebhookId_idx" ON "OrganizationIntegration"("externalWebhookId");
