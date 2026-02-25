-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('admin', 'editor', 'viewer');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('pending', 'active', 'inactive', 'rejected');

-- AlterTable: convert role from String to UserRole enum
ALTER TABLE "User" ADD COLUMN "role_new" "UserRole" NOT NULL DEFAULT 'viewer';
UPDATE "User" SET "role_new" = 'admin';
ALTER TABLE "User" DROP COLUMN "role";
ALTER TABLE "User" RENAME COLUMN "role_new" TO "role";

-- AlterTable: add status column
ALTER TABLE "User" ADD COLUMN "status" "UserStatus" NOT NULL DEFAULT 'pending';
UPDATE "User" SET "status" = 'active';
