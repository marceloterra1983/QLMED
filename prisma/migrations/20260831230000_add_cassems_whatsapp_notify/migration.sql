-- SPEC-034: aviso do ofício CASSEMS no grupo do WhatsApp.
-- Colunas nullable e aditivas: nenhuma linha existente precisa de backfill e a
-- ausência de valor significa "nenhum aviso enviado para esta mensagem", que é
-- o estado correto para as autorizações históricas já coletadas.
ALTER TABLE "CassemsSourceMessage" ADD COLUMN "whatsappSentAt" TIMESTAMP(3);
ALTER TABLE "CassemsSourceMessage" ADD COLUMN "whatsappMessageId" TEXT;
