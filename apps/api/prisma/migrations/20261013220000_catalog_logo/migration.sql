-- AlterTable
ALTER TABLE "Catalog" ADD COLUMN     "logoUrl" TEXT,
ADD COLUMN     "logoInvert" BOOLEAN NOT NULL DEFAULT false;
