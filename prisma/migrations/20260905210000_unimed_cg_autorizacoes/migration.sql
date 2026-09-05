-- SPEC-045: autorizações Unimed CG (expand-only).

-- CreateEnum
CREATE TYPE "UnimedCgParseStatus" AS ENUM ('ok', 'parcial', 'falha');

-- CreateTable
CREATE TABLE "UnimedCgAuthorization" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "processId" TEXT NOT NULL,
    "authorizationNumber" TEXT,
    "procedureDate" TIMESTAMP(3),
    "location" TEXT,
    "totalAmount" DECIMAL(65,30) NOT NULL,
    "oneDriveItemId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "parseStatus" "UnimedCgParseStatus" NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UnimedCgAuthorization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnimedCgSourceMessage" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "authorizationId" TEXT,
    "mailbox" TEXT NOT NULL,
    "graphMessageId" TEXT NOT NULL,
    "internetMessageId" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "whatsappSentAt" TIMESTAMP(3),
    "whatsappMessageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UnimedCgSourceMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnimedCgIngestState" (
    "companyId" TEXT NOT NULL,
    "lastSuccessAt" TIMESTAMP(3),
    "lastError" TEXT,
    "lastErrorAt" TIMESTAMP(3),
    "backfillCompletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UnimedCgIngestState_pkey" PRIMARY KEY ("companyId")
);

-- CreateIndex
CREATE INDEX "UnimedCgAuthorization_companyId_receivedAt_idx" ON "UnimedCgAuthorization"("companyId", "receivedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "UnimedCgAuthorization_companyId_processId_key" ON "UnimedCgAuthorization"("companyId", "processId");

-- CreateIndex
CREATE INDEX "UnimedCgSourceMessage_companyId_idx" ON "UnimedCgSourceMessage"("companyId");

-- CreateIndex
CREATE INDEX "UnimedCgSourceMessage_authorizationId_idx" ON "UnimedCgSourceMessage"("authorizationId");

-- CreateIndex
CREATE UNIQUE INDEX "UnimedCgSourceMessage_companyId_internetMessageId_key" ON "UnimedCgSourceMessage"("companyId", "internetMessageId");

-- AddForeignKey
ALTER TABLE "UnimedCgAuthorization" ADD CONSTRAINT "UnimedCgAuthorization_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnimedCgSourceMessage" ADD CONSTRAINT "UnimedCgSourceMessage_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnimedCgSourceMessage" ADD CONSTRAINT "UnimedCgSourceMessage_authorizationId_fkey" FOREIGN KEY ("authorizationId") REFERENCES "UnimedCgAuthorization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnimedCgIngestState" ADD CONSTRAINT "UnimedCgIngestState_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
