CREATE TABLE "ContactOverride" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "cnpj" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "street" TEXT,
    "number" TEXT,
    "complement" TEXT,
    "district" TEXT,
    "city" TEXT,
    "state" TEXT,
    "zipCode" TEXT,
    "country" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContactOverride_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ContactOverride_companyId_cnpj_key" ON "ContactOverride"("companyId", "cnpj");
CREATE INDEX "ContactOverride_companyId_idx" ON "ContactOverride"("companyId");

ALTER TABLE "ContactOverride" ADD CONSTRAINT "ContactOverride_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
