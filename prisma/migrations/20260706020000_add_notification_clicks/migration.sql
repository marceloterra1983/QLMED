SET lock_timeout = '10s';
SET statement_timeout = '15min';

CREATE TABLE IF NOT EXISTS "NotificationClick" (
    "id" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "targetPath" TEXT NOT NULL DEFAULT '/fiscal/invoices',
    "userAgent" TEXT,
    "ipHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationClick_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "NotificationClick_deliveryId_createdAt_idx"
  ON "NotificationClick"("deliveryId", "createdAt");

CREATE INDEX IF NOT EXISTS "NotificationClick_createdAt_idx"
  ON "NotificationClick"("createdAt");

ALTER TABLE "NotificationClick" DROP CONSTRAINT IF EXISTS "NotificationClick_deliveryId_fkey";
ALTER TABLE "NotificationClick"
  ADD CONSTRAINT "NotificationClick_deliveryId_fkey"
  FOREIGN KEY ("deliveryId")
  REFERENCES "NotificationDelivery"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;
