-- SPEC-020: cancelamento homologado, ortogonal a Invoice.status.

ALTER TABLE "Invoice" ADD COLUMN "cancelledAt" TIMESTAMP(3);
