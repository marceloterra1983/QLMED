-- SPEC-042: cadastro de documentos/certidões (expand-only).

-- CreateEnum
CREATE TYPE "CompanyDocumentKind" AS ENUM ('cnd_federal', 'crf_fgts', 'cndt', 'cnd_estadual_ms', 'cnd_municipal_mobiliario', 'cnd_municipal_gerais', 'outro');

-- CreateTable
CREATE TABLE "CompanyDocument" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'certidao',
    "kind" "CompanyDocumentKind" NOT NULL,
    "fileName" TEXT NOT NULL,
    "oneDriveItemId" TEXT NOT NULL,
    "oneDriveAccount" TEXT NOT NULL,
    "folderName" TEXT NOT NULL,
    "fileSize" INTEGER,
    "lastModifiedAt" TIMESTAMP(3),
    "validUntil" DATE,
    "validUntilSource" TEXT,
    "removedAt" TIMESTAMP(3),
    "alertedThresholds" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "renewalNotifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyDocumentIngestState" (
    "companyId" TEXT NOT NULL,
    "lastSuccessAt" TIMESTAMP(3),
    "lastError" TEXT,
    "lastErrorAt" TIMESTAMP(3),
    "lastAlertDay" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyDocumentIngestState_pkey" PRIMARY KEY ("companyId")
);

-- CreateIndex
CREATE UNIQUE INDEX "CompanyDocument_oneDriveItemId_key" ON "CompanyDocument"("oneDriveItemId");

-- CreateIndex
CREATE INDEX "CompanyDocument_companyId_kind_validUntil_idx" ON "CompanyDocument"("companyId", "kind", "validUntil");

-- CreateIndex
CREATE INDEX "CompanyDocument_companyId_removedAt_idx" ON "CompanyDocument"("companyId", "removedAt");

-- AddForeignKey
ALTER TABLE "CompanyDocument" ADD CONSTRAINT "CompanyDocument_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyDocumentIngestState" ADD CONSTRAINT "CompanyDocumentIngestState_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
