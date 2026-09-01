-- Re-auditoria da remediação b177b07, REAUD-DATA-015.
--
-- O unique parcial de NF-e emitida (20260901180000) transforma uma duplicata
-- silenciosa numa P2002 no upsert do sync SEFAZ. O sync tratava-a como
-- qualquer erro de gravação: retinha o cursor NSU antes do documento. Só que
-- esta falha é DETERMINÍSTICA — a corrida seguinte tropeça no mesmo NSU, e a
-- ingestão fiscal da empresa parava até intervenção manual.
--
-- Esta tabela é o "skip durável por chave" que o próprio código já anunciava
-- como próximo passo: o documento recusado fica aqui, com o XML (nada se
-- perde), o cursor segue, e a corrida sai `partial` com o motivo. Unique por
-- (empresa, chave): reentrega do mesmo documento só actualiza a linha.
--
-- Tabela nova e vazia: não há pré-checagem. Mas a ORDEM importa — sem ela a
-- escrita durável falha, o erro sobe para o catch da corrida e o cursor não
-- avança (fail-closed, por desenho). Aplicar antes de o código novo servir.

-- CreateTable
CREATE TABLE "SyncSkippedDocument" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "accessKey" TEXT NOT NULL,
    "nsu" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "xmlContent" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SyncSkippedDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SyncSkippedDocument_companyId_accessKey_key" ON "SyncSkippedDocument"("companyId", "accessKey");

-- AddForeignKey
ALTER TABLE "SyncSkippedDocument" ADD CONSTRAINT "SyncSkippedDocument_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
