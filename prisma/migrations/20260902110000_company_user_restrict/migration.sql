-- Auditoria b177b07, QLMED-INFO-002: Company.userId estava ON DELETE CASCADE.
-- Apagar um User levava junto a Company, e por cascade toda a Invoice, todo o
-- XML fiscal e agora (com a migração 20260902100000) todas as satélites. Não há
-- rota que apague User — a API só faz PATCH de status — mas um script manual ou
-- um `deleteMany` de teste apontado ao banco errado bastaria. RESTRICT torna o
-- acidente impossível em vez de improvável.
--
-- Esta migração não pode falhar por dado existente: RESTRICT só é verificado em
-- DELETE futuro, não na criação da constraint. A pré-checagem aqui é de
-- operação, não de integridade — depois de aplicar, apagar um usuário que ainda
-- tem empresa passa a dar erro. Para saber quem seria afetado:
--
--   SELECT u.id, u.email, COUNT(c.id) AS empresas
--     FROM "User" u JOIN "Company" c ON c."userId" = u.id
--    GROUP BY u.id, u.email;
--
-- Todo usuário listado aí precisa que a empresa seja reapontada antes de
-- qualquer tentativa de exclusão. NEEDS AUTHORIZED LIVE EVIDENCE: não corrida
-- contra o banco canônico.

-- DropForeignKey
ALTER TABLE "Company" DROP CONSTRAINT "Company_userId_fkey";

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
