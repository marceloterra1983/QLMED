-- Anti-replay do webhook n8n entre réplicas (auditoria b177b07, INT-003).
--
-- Tabela nova e vazia: não há pré-checagem a fazer, e nada em produção
-- referencia estas linhas. Mas a ORDEM importa — sem esta tabela o
-- `consumeWebhookNonce` cai no catch e o webhook recusa TODA chamada. Esta
-- migração tem de estar aplicada antes de o código novo servir tráfego.
--
-- `timestamptz` é deliberado: o código compara `expiresAt` com um `Date`
-- ligado por parâmetro, e um `timestamp` sem fuso faria a comparação depender
-- do `TimeZone` da sessão.

-- CreateTable
CREATE TABLE "N8nWebhookNonce" (
    "nonce"     TEXT        NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "N8nWebhookNonce_pkey" PRIMARY KEY ("nonce")
);

-- CreateIndex
CREATE INDEX "N8nWebhookNonce_expiresAt_idx" ON "N8nWebhookNonce"("expiresAt");
