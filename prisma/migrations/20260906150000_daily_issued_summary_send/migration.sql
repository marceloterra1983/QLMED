-- Expand-only: claim idempotente do Resumo Diário (cross preview/prod).
CREATE TABLE "daily_issued_summary_send" (
    "date_iso" VARCHAR(10) NOT NULL,
    "claimed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMP(3),
    "source" VARCHAR(64),

    CONSTRAINT "daily_issued_summary_send_pkey" PRIMARY KEY ("date_iso")
);

-- Backfill: 2026-09-05 já foi (sobre)enviado; bloqueia reenvio.
INSERT INTO "daily_issued_summary_send" ("date_iso", "claimed_at", "sent_at", "source")
VALUES ('2026-09-05', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'backfill-dup-mitigation')
ON CONFLICT ("date_iso") DO NOTHING;
