-- CreateTable
CREATE TABLE "OneDriveConnection" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "accountEmail" TEXT NOT NULL,
  "accountName" TEXT,
  "microsoftUserId" TEXT,
  "driveId" TEXT NOT NULL,
  "driveType" TEXT,
  "driveWebUrl" TEXT,
  "accessToken" TEXT NOT NULL,
  "refreshToken" TEXT,
  "tokenExpiresAt" TIMESTAMP(3) NOT NULL,
  "scope" TEXT,
  "lastValidatedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "OneDriveConnection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OneDriveConnection_companyId_accountEmail_key" ON "OneDriveConnection"("companyId", "accountEmail");

-- CreateIndex
CREATE INDEX "OneDriveConnection_companyId_idx" ON "OneDriveConnection"("companyId");

-- AddForeignKey
ALTER TABLE "OneDriveConnection" ADD CONSTRAINT "OneDriveConnection_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
