CREATE TABLE "ContactNickname" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "cnpj" TEXT NOT NULL,
    "shortName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContactNickname_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ContactNickname_companyId_cnpj_key" ON "ContactNickname"("companyId", "cnpj");
CREATE INDEX "ContactNickname_companyId_idx" ON "ContactNickname"("companyId");

ALTER TABLE "ContactNickname" ADD CONSTRAINT "ContactNickname_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
