-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'user',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "cnpj" TEXT NOT NULL,
    "razaoSocial" TEXT NOT NULL,
    "nomeFantasia" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NsdocsConfig" (
    "id" TEXT NOT NULL,
    "apiToken" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "autoSync" BOOLEAN NOT NULL DEFAULT true,
    "syncInterval" INTEGER NOT NULL DEFAULT 60,
    "lastNsu" TEXT,
    "lastSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NsdocsConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CertificateConfig" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "pfxData" BYTEA NOT NULL,
    "pfxPassword" TEXT NOT NULL,
    "serialNumber" TEXT,
    "issuer" TEXT,
    "subject" TEXT,
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "cnpjCertificate" TEXT,
    "environment" TEXT NOT NULL DEFAULT 'production',
    "lastNsu" TEXT NOT NULL DEFAULT '000000000000000',
    "lastSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CertificateConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncLog" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "syncMethod" TEXT NOT NULL DEFAULT 'sefaz',
    "status" TEXT NOT NULL DEFAULT 'running',
    "newDocs" INTEGER NOT NULL DEFAULT 0,
    "updatedDocs" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "SyncLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "accessKey" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "direction" TEXT NOT NULL DEFAULT 'received',
    "number" TEXT NOT NULL,
    "series" TEXT,
    "issueDate" TIMESTAMP(3) NOT NULL,
    "senderCnpj" TEXT NOT NULL,
    "senderName" TEXT NOT NULL,
    "recipientCnpj" TEXT NOT NULL,
    "recipientName" TEXT NOT NULL,
    "totalValue" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'received',
    "xmlContent" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Company_cnpj_key" ON "Company"("cnpj");

-- CreateIndex
CREATE UNIQUE INDEX "NsdocsConfig_companyId_key" ON "NsdocsConfig"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "CertificateConfig_companyId_key" ON "CertificateConfig"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_accessKey_key" ON "Invoice"("accessKey");

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NsdocsConfig" ADD CONSTRAINT "NsdocsConfig_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CertificateConfig" ADD CONSTRAINT "CertificateConfig_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
