-- CreateTable
CREATE TABLE "N8nIntegrationConfig" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "apiToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "N8nIntegrationConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "N8nIntegrationConfig_companyId_key" ON "N8nIntegrationConfig"("companyId");

-- CreateIndex
CREATE INDEX "N8nIntegrationConfig_companyId_idx" ON "N8nIntegrationConfig"("companyId");

-- AddForeignKey
ALTER TABLE "N8nIntegrationConfig" ADD CONSTRAINT "N8nIntegrationConfig_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

