-- AlterTable
ALTER TABLE "User" ADD COLUMN "phone" TEXT;
ALTER TABLE "User" ADD COLUMN "allowedPages" TEXT[] NOT NULL DEFAULT '{}';
