-- SPEC-048: autorizações Unimed CG para entrega (expand-only).

-- CreateTable
CREATE TABLE "UnimedCgDeliveryAuthorization" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "processId" TEXT NOT NULL,
    "principalAuthorization" TEXT,
    "status" TEXT,
    "authorizedAt" TIMESTAMP(3),
    "supplier" TEXT,
    "oneDriveItemId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "parseStatus" "UnimedCgParseStatus" NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UnimedCgDeliveryAuthorization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnimedCgDeliverySourceMessage" (
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

    CONSTRAINT "UnimedCgDeliverySourceMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UnimedCgDeliveryAuthorization_companyId_receivedAt_idx" ON "UnimedCgDeliveryAuthorization"("companyId", "receivedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "UnimedCgDeliveryAuthorization_companyId_processId_key" ON "UnimedCgDeliveryAuthorization"("companyId", "processId");

-- CreateIndex
CREATE INDEX "UnimedCgDeliverySourceMessage_companyId_idx" ON "UnimedCgDeliverySourceMessage"("companyId");

-- CreateIndex
CREATE INDEX "UnimedCgDeliverySourceMessage_authorizationId_idx" ON "UnimedCgDeliverySourceMessage"("authorizationId");

-- CreateIndex
CREATE UNIQUE INDEX "UnimedCgDeliverySourceMessage_companyId_internetMessageId_key" ON "UnimedCgDeliverySourceMessage"("companyId", "internetMessageId");

-- AddForeignKey
ALTER TABLE "UnimedCgDeliveryAuthorization" ADD CONSTRAINT "UnimedCgDeliveryAuthorization_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnimedCgDeliverySourceMessage" ADD CONSTRAINT "UnimedCgDeliverySourceMessage_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnimedCgDeliverySourceMessage" ADD CONSTRAINT "UnimedCgDeliverySourceMessage_authorizationId_fkey" FOREIGN KEY ("authorizationId") REFERENCES "UnimedCgDeliveryAuthorization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
