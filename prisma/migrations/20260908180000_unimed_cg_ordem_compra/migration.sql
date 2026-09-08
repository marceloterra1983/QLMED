-- SPEC-069: Unimed CG ordem de compra SOULMV (expand-only).

-- CreateTable
CREATE TABLE "UnimedCgPurchaseOrder" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "requestNumber" TEXT,
    "orderDate" TIMESTAMP(3),
    "billingCnpj" TEXT,
    "buyerName" TEXT,
    "paymentTerms" TEXT,
    "paymentTermsCode" TEXT,
    "deliveryFrom" TIMESTAMP(3),
    "deliveryTo" TIMESTAMP(3),
    "supplierName" TEXT,
    "supplierCnpj" TEXT,
    "totalAmount" DECIMAL(65,30) NOT NULL,
    "oneDriveItemId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "parseStatus" "UnimedCgParseStatus" NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UnimedCgPurchaseOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnimedCgPurchaseOrderItem" (
    "id" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "lineNumber" INTEGER NOT NULL,
    "productCode" TEXT,
    "description" TEXT NOT NULL,
    "unit" TEXT,
    "quantity" DECIMAL(65,30) NOT NULL,
    "unitPrice" DECIMAL(65,30) NOT NULL,
    "lineTotal" DECIMAL(65,30) NOT NULL,

    CONSTRAINT "UnimedCgPurchaseOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnimedCgPurchaseOrderSourceMessage" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "purchaseOrderId" TEXT,
    "mailbox" TEXT NOT NULL,
    "graphMessageId" TEXT NOT NULL,
    "internetMessageId" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UnimedCgPurchaseOrderSourceMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UnimedCgPurchaseOrder_companyId_orderNumber_key" ON "UnimedCgPurchaseOrder"("companyId", "orderNumber");

-- CreateIndex
CREATE INDEX "UnimedCgPurchaseOrder_companyId_receivedAt_idx" ON "UnimedCgPurchaseOrder"("companyId", "receivedAt" DESC);

-- CreateIndex
CREATE INDEX "UnimedCgPurchaseOrderItem_purchaseOrderId_lineNumber_idx" ON "UnimedCgPurchaseOrderItem"("purchaseOrderId", "lineNumber");

-- CreateIndex
CREATE INDEX "UnimedCgPurchaseOrderItem_companyId_idx" ON "UnimedCgPurchaseOrderItem"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "UnimedCgPurchaseOrderSourceMessage_companyId_internetMess_key" ON "UnimedCgPurchaseOrderSourceMessage"("companyId", "internetMessageId");

-- CreateIndex
CREATE INDEX "UnimedCgPurchaseOrderSourceMessage_companyId_idx" ON "UnimedCgPurchaseOrderSourceMessage"("companyId");

-- CreateIndex
CREATE INDEX "UnimedCgPurchaseOrderSourceMessage_purchaseOrderId_idx" ON "UnimedCgPurchaseOrderSourceMessage"("purchaseOrderId");

-- AddForeignKey
ALTER TABLE "UnimedCgPurchaseOrder" ADD CONSTRAINT "UnimedCgPurchaseOrder_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnimedCgPurchaseOrderItem" ADD CONSTRAINT "UnimedCgPurchaseOrderItem_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "UnimedCgPurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnimedCgPurchaseOrderItem" ADD CONSTRAINT "UnimedCgPurchaseOrderItem_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnimedCgPurchaseOrderSourceMessage" ADD CONSTRAINT "UnimedCgPurchaseOrderSourceMessage_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnimedCgPurchaseOrderSourceMessage" ADD CONSTRAINT "UnimedCgPurchaseOrderSourceMessage_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "UnimedCgPurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
