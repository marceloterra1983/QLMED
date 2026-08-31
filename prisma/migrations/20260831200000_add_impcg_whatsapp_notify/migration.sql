-- SPEC-031: aviso do ofício IMPCG no grupo do WhatsApp.
-- Colunas nullable e aditivas: nenhuma linha existente precisa de backfill e a
-- ausência de valor significa "nenhum aviso enviado para esta mensagem", que é
-- o estado correto para as autorizações históricas já coletadas.
ALTER TABLE "ImpcgSourceMessage" ADD COLUMN "whatsappSentAt" TIMESTAMP(3);
ALTER TABLE "ImpcgSourceMessage" ADD COLUMN "whatsappMessageId" TEXT;
