-- AlterTable
ALTER TABLE "AssetItem" ADD COLUMN     "maxSizeMb" INTEGER,
ADD COLUMN     "requiredDimensions" TEXT,
ADD COLUMN     "requiredFileTypes" TEXT[] DEFAULT ARRAY[]::TEXT[];

