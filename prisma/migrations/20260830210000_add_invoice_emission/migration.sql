-- Expand: rascunho e trilha de emissão de NF-e. Invoice permanece só para
-- documentos com chave e XML autorizado.

CREATE TYPE "InvoiceEmissionStatus" AS ENUM ('draft', 'submitted', 'authorized', 'rejected');

CREATE TABLE "InvoiceEmission" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "status" "InvoiceEmissionStatus" NOT NULL DEFAULT 'draft',
    "series" TEXT NOT NULL,
    "number" TEXT,
    "natureza" TEXT NOT NULL,
    "cfop" TEXT NOT NULL,
    "destCnpj" TEXT NOT NULL,
    "destName" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "totalValue" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "accessKey" TEXT,
    "sefazStat" TEXT,
    "sefazMotivo" TEXT,
    "signedXml" TEXT,
    "protocolXml" TEXT,
    "invoiceId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvoiceEmission_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InvoiceEmission_accessKey_key" ON "InvoiceEmission"("accessKey");
CREATE UNIQUE INDEX "InvoiceEmission_invoiceId_key" ON "InvoiceEmission"("invoiceId");
CREATE INDEX "InvoiceEmission_companyId_status_idx" ON "InvoiceEmission"("companyId", "status");
CREATE INDEX "InvoiceEmission_companyId_destCnpj_idx" ON "InvoiceEmission"("companyId", "destCnpj");

ALTER TABLE "InvoiceEmission" ADD CONSTRAINT "InvoiceEmission_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
