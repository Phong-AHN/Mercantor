-- CreateTable
CREATE TABLE "PlatformIntegration" (
    "provider" "IntegrationProvider" NOT NULL,
    "encryptedConfig" TEXT NOT NULL,
    "updatedById" UUID,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PlatformIntegration_pkey" PRIMARY KEY ("provider")
);

-- CreateTable
CREATE TABLE "RolePermissionOverride" (
    "role" "UserRole" NOT NULL,
    "permission" TEXT NOT NULL,
    "granted" BOOLEAN NOT NULL,
    "updatedById" UUID,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "RolePermissionOverride_pkey" PRIMARY KEY ("role","permission")
);

-- AddForeignKey
ALTER TABLE "PlatformIntegration" ADD CONSTRAINT "PlatformIntegration_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermissionOverride" ADD CONSTRAINT "RolePermissionOverride_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

