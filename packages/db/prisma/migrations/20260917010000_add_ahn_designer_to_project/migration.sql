-- AlterTable
ALTER TABLE "Project" ADD COLUMN "ahnDesignerId" UUID;

-- CreateIndex
CREATE INDEX "Project_ahnDesignerId_idx" ON "Project"("ahnDesignerId");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_ahnDesignerId_fkey" FOREIGN KEY ("ahnDesignerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
