-- SPEC-049: Unimed CG reversão / pré-solicitação / prazo NF (expand-only).

-- CreateTable
CREATE TABLE "UnimedCgProcessReversal" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "processId" TEXT NOT NULL,
    "authorizationNumber" TEXT,
    "procedureDate" TIMESTAMP(3),
    "patientName" TEXT,
    "location" TEXT,
    "procedureType" TEXT,
    "oneDriveItemId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "parseStatus" "UnimedCgParseStatus" NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UnimedCgProcessReversal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnimedCgProcessReversalSourceMessage" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "reversalId" TEXT,
    "mailbox" TEXT NOT NULL,
    "graphMessageId" TEXT NOT NULL,
    "internetMessageId" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "whatsappSentAt" TIMESTAMP(3),
    "whatsappMessageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UnimedCgProcessReversalSourceMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnimedCgPreSolicitation" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "preSolicitationId" TEXT NOT NULL,
    "patientName" TEXT,
    "procedureType" TEXT,
    "quoteDeadlineDays" INTEGER,
    "oneDriveItemId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "parseStatus" "UnimedCgParseStatus" NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UnimedCgPreSolicitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnimedCgPreSolicitationSourceMessage" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "preSolicitationRefId" TEXT,
    "mailbox" TEXT NOT NULL,
    "graphMessageId" TEXT NOT NULL,
    "internetMessageId" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "whatsappSentAt" TIMESTAMP(3),
    "whatsappMessageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UnimedCgPreSolicitationSourceMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnimedCgInvoiceDeadline" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "processId" TEXT NOT NULL,
    "patientName" TEXT,
    "oneDriveItemId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "parseStatus" "UnimedCgParseStatus" NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UnimedCgInvoiceDeadline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnimedCgInvoiceDeadlineSourceMessage" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "deadlineId" TEXT,
    "mailbox" TEXT NOT NULL,
    "graphMessageId" TEXT NOT NULL,
    "internetMessageId" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "whatsappSentAt" TIMESTAMP(3),
    "whatsappMessageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UnimedCgInvoiceDeadlineSourceMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UnimedCgProcessReversal_companyId_receivedAt_idx" ON "UnimedCgProcessReversal"("companyId", "receivedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "UnimedCgProcessReversal_companyId_processId_key" ON "UnimedCgProcessReversal"("companyId", "processId");

-- CreateIndex
CREATE INDEX "UnimedCgProcessReversalSourceMessage_companyId_idx" ON "UnimedCgProcessReversalSourceMessage"("companyId");

-- CreateIndex
CREATE INDEX "UnimedCgProcessReversalSourceMessage_reversalId_idx" ON "UnimedCgProcessReversalSourceMessage"("reversalId");

-- CreateIndex
CREATE UNIQUE INDEX "UnimedCgProcessReversalSourceMessage_companyId_internetMessageId_key" ON "UnimedCgProcessReversalSourceMessage"("companyId", "internetMessageId");

-- CreateIndex
CREATE INDEX "UnimedCgPreSolicitation_companyId_receivedAt_idx" ON "UnimedCgPreSolicitation"("companyId", "receivedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "UnimedCgPreSolicitation_companyId_preSolicitationId_key" ON "UnimedCgPreSolicitation"("companyId", "preSolicitationId");

-- CreateIndex
CREATE INDEX "UnimedCgPreSolicitationSourceMessage_companyId_idx" ON "UnimedCgPreSolicitationSourceMessage"("companyId");

-- CreateIndex
CREATE INDEX "UnimedCgPreSolicitationSourceMessage_preSolicitationRefId_idx" ON "UnimedCgPreSolicitationSourceMessage"("preSolicitationRefId");

-- CreateIndex
CREATE UNIQUE INDEX "UnimedCgPreSolicitationSourceMessage_companyId_internetMessageId_key" ON "UnimedCgPreSolicitationSourceMessage"("companyId", "internetMessageId");

-- CreateIndex
CREATE INDEX "UnimedCgInvoiceDeadline_companyId_receivedAt_idx" ON "UnimedCgInvoiceDeadline"("companyId", "receivedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "UnimedCgInvoiceDeadline_companyId_processId_key" ON "UnimedCgInvoiceDeadline"("companyId", "processId");

-- CreateIndex
CREATE INDEX "UnimedCgInvoiceDeadlineSourceMessage_companyId_idx" ON "UnimedCgInvoiceDeadlineSourceMessage"("companyId");

-- CreateIndex
CREATE INDEX "UnimedCgInvoiceDeadlineSourceMessage_deadlineId_idx" ON "UnimedCgInvoiceDeadlineSourceMessage"("deadlineId");

-- CreateIndex
CREATE UNIQUE INDEX "UnimedCgInvoiceDeadlineSourceMessage_companyId_internetMessageId_key" ON "UnimedCgInvoiceDeadlineSourceMessage"("companyId", "internetMessageId");

-- AddForeignKey
ALTER TABLE "UnimedCgProcessReversal" ADD CONSTRAINT "UnimedCgProcessReversal_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnimedCgProcessReversalSourceMessage" ADD CONSTRAINT "UnimedCgProcessReversalSourceMessage_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnimedCgProcessReversalSourceMessage" ADD CONSTRAINT "UnimedCgProcessReversalSourceMessage_reversalId_fkey" FOREIGN KEY ("reversalId") REFERENCES "UnimedCgProcessReversal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnimedCgPreSolicitation" ADD CONSTRAINT "UnimedCgPreSolicitation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnimedCgPreSolicitationSourceMessage" ADD CONSTRAINT "UnimedCgPreSolicitationSourceMessage_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnimedCgPreSolicitationSourceMessage" ADD CONSTRAINT "UnimedCgPreSolicitationSourceMessage_preSolicitationRefId_fkey" FOREIGN KEY ("preSolicitationRefId") REFERENCES "UnimedCgPreSolicitation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnimedCgInvoiceDeadline" ADD CONSTRAINT "UnimedCgInvoiceDeadline_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnimedCgInvoiceDeadlineSourceMessage" ADD CONSTRAINT "UnimedCgInvoiceDeadlineSourceMessage_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnimedCgInvoiceDeadlineSourceMessage" ADD CONSTRAINT "UnimedCgInvoiceDeadlineSourceMessage_deadlineId_fkey" FOREIGN KEY ("deadlineId") REFERENCES "UnimedCgInvoiceDeadline"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Expand-only: beneficiário (patientName) em tabelas com processId já existentes
ALTER TABLE "UnimedCgAuthorization" ADD COLUMN IF NOT EXISTS "patientName" TEXT;
ALTER TABLE "UnimedCgDeliveryAuthorization" ADD COLUMN IF NOT EXISTS "patientName" TEXT;
