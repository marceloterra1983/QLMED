-- AlterTable
ALTER TABLE "Invoice" ALTER COLUMN "recipientCnpj" DROP NOT NULL;
ALTER TABLE "Invoice" ALTER COLUMN "recipientName" DROP NOT NULL;
