ALTER TYPE "SyncMethod" ADD VALUE IF NOT EXISTS 'receita_nfse';

CREATE TABLE "ReceitaNfseConfig" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "apiToken" TEXT,
  "autoSync" BOOLEAN NOT NULL DEFAULT true,
  "syncInterval" INTEGER NOT NULL DEFAULT 60,
  "environment" TEXT NOT NULL DEFAULT 'production',
  "baseUrl" TEXT,
  "cnpjConsulta" TEXT,
  "lastNsu" TEXT NOT NULL DEFAULT '000000000000000',
  "lastSyncAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ReceitaNfseConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ReceitaNfseConfig_companyId_key" ON "ReceitaNfseConfig"("companyId");
CREATE INDEX "ReceitaNfseConfig_companyId_idx" ON "ReceitaNfseConfig"("companyId");

ALTER TABLE "ReceitaNfseConfig"
  ADD CONSTRAINT "ReceitaNfseConfig_companyId_fkey"
  FOREIGN KEY ("companyId")
  REFERENCES "Company"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;
