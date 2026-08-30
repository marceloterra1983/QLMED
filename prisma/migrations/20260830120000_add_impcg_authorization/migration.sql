-- SPEC-023: autorizações IMPCG (expand-only).

-- CreateEnum
CREATE TYPE "ImpcgParseStatus" AS ENUM ('ok', 'parcial', 'falha');

-- CreateTable
CREATE TABLE "ImpcgAuthorization" (
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
    "parseStatus" "ImpcgParseStatus" NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImpcgAuthorization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImpcgAuthorizationItem" (
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

    CONSTRAINT "ImpcgAuthorizationItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImpcgSourceMessage" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "authorizationId" TEXT,
    "mailbox" TEXT NOT NULL,
    "graphMessageId" TEXT NOT NULL,
    "internetMessageId" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImpcgSourceMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImpcgIngestState" (
    "companyId" TEXT NOT NULL,
    "lastSuccessAt" TIMESTAMP(3),
    "lastError" TEXT,
    "lastErrorAt" TIMESTAMP(3),
    "backfillCompletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImpcgIngestState_pkey" PRIMARY KEY ("companyId")
);

-- CreateIndex
CREATE INDEX "ImpcgAuthorization_companyId_idx" ON "ImpcgAuthorization"("companyId");

-- CreateIndex
CREATE INDEX "ImpcgAuthorization_companyId_issuedAt_idx" ON "ImpcgAuthorization"("companyId", "issuedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "ImpcgAuthorization_companyId_oficioNumber_key" ON "ImpcgAuthorization"("companyId", "oficioNumber");

-- CreateIndex
CREATE INDEX "ImpcgAuthorizationItem_authorizationId_sortOrder_idx" ON "ImpcgAuthorizationItem"("authorizationId", "sortOrder");

-- CreateIndex
CREATE INDEX "ImpcgSourceMessage_companyId_idx" ON "ImpcgSourceMessage"("companyId");

-- CreateIndex
CREATE INDEX "ImpcgSourceMessage_authorizationId_idx" ON "ImpcgSourceMessage"("authorizationId");

-- CreateIndex
CREATE UNIQUE INDEX "ImpcgSourceMessage_companyId_internetMessageId_key" ON "ImpcgSourceMessage"("companyId", "internetMessageId");

-- AddForeignKey
ALTER TABLE "ImpcgAuthorization" ADD CONSTRAINT "ImpcgAuthorization_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImpcgAuthorizationItem" ADD CONSTRAINT "ImpcgAuthorizationItem_authorizationId_fkey" FOREIGN KEY ("authorizationId") REFERENCES "ImpcgAuthorization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImpcgSourceMessage" ADD CONSTRAINT "ImpcgSourceMessage_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImpcgSourceMessage" ADD CONSTRAINT "ImpcgSourceMessage_authorizationId_fkey" FOREIGN KEY ("authorizationId") REFERENCES "ImpcgAuthorization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImpcgIngestState" ADD CONSTRAINT "ImpcgIngestState_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
