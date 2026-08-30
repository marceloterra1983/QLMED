-- SPEC-024: autorizações CASSEMS (expand-only).

-- CreateEnum
CREATE TYPE "CassemsParseStatus" AS ENUM ('ok', 'parcial', 'falha');

-- CreateTable
CREATE TABLE "CassemsAuthorization" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "oficioNumber" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3),
    "patientName" TEXT NOT NULL,
    "patientRegistry" TEXT,
    "doctorName" TEXT,
    "doctorCrm" TEXT,
    "procedureName" TEXT,
    "hospitalName" TEXT,
    "totalAmount" DECIMAL(65,30) NOT NULL,
    "oneDriveItemId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "parseStatus" "CassemsParseStatus" NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CassemsAuthorization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CassemsAuthorizationItem" (
    "id" TEXT NOT NULL,
    "authorizationId" TEXT NOT NULL,
    "anvisaCode" TEXT,
    "description" TEXT NOT NULL,
    "brand" TEXT,
    "reference" TEXT,
    "quantity" DECIMAL(65,30) NOT NULL,
    "unitAmount" DECIMAL(65,30) NOT NULL,
    "lineTotal" DECIMAL(65,30) NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CassemsAuthorizationItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CassemsSourceMessage" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "authorizationId" TEXT,
    "mailbox" TEXT NOT NULL,
    "graphMessageId" TEXT NOT NULL,
    "internetMessageId" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CassemsSourceMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CassemsIngestState" (
    "companyId" TEXT NOT NULL,
    "lastSuccessAt" TIMESTAMP(3),
    "lastError" TEXT,
    "lastErrorAt" TIMESTAMP(3),
    "backfillCompletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CassemsIngestState_pkey" PRIMARY KEY ("companyId")
);

-- CreateIndex
CREATE INDEX "CassemsAuthorization_companyId_idx" ON "CassemsAuthorization"("companyId");

-- CreateIndex
CREATE INDEX "CassemsAuthorization_companyId_issuedAt_idx" ON "CassemsAuthorization"("companyId", "issuedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "CassemsAuthorization_companyId_oficioNumber_key" ON "CassemsAuthorization"("companyId", "oficioNumber");

-- CreateIndex
CREATE INDEX "CassemsAuthorizationItem_authorizationId_sortOrder_idx" ON "CassemsAuthorizationItem"("authorizationId", "sortOrder");

-- CreateIndex
CREATE INDEX "CassemsSourceMessage_companyId_idx" ON "CassemsSourceMessage"("companyId");

-- CreateIndex
CREATE INDEX "CassemsSourceMessage_authorizationId_idx" ON "CassemsSourceMessage"("authorizationId");

-- CreateIndex
CREATE UNIQUE INDEX "CassemsSourceMessage_companyId_internetMessageId_key" ON "CassemsSourceMessage"("companyId", "internetMessageId");

-- AddForeignKey
ALTER TABLE "CassemsAuthorization" ADD CONSTRAINT "CassemsAuthorization_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CassemsAuthorizationItem" ADD CONSTRAINT "CassemsAuthorizationItem_authorizationId_fkey" FOREIGN KEY ("authorizationId") REFERENCES "CassemsAuthorization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CassemsSourceMessage" ADD CONSTRAINT "CassemsSourceMessage_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CassemsSourceMessage" ADD CONSTRAINT "CassemsSourceMessage_authorizationId_fkey" FOREIGN KEY ("authorizationId") REFERENCES "CassemsAuthorization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CassemsIngestState" ADD CONSTRAINT "CassemsIngestState_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
