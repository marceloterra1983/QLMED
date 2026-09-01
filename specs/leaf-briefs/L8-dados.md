# Findings de L8-dados

## QLMED-DATA-001 — 11 satélites Prisma sem FK/@relation; DELETE de Invoice órfão
- severidade: high | status: confirmed | confiança: high
- local: prisma/schema.prisma:502 (InvoiceTaxTotals)
- invariante: Satélite com invoiceId/companyId tem FK ou cascade aplicativo testado.
- cenário: Tax/duplicata/stock/registry sem FK. Rotas delete não apagam satélites.
- esperado: FK ON DELETE CASCADE ou delete em TX.
- observado: schema 502-831; invoices/[id] delete 75-77.
- causa raiz: Satélites criados via SQL reconcile sem FK.
- correção mínima: FK ou TX delete satélites; teste.
- teste de regressão: DELETE invoice remove tax/duplicata/stock rows.
- risco residual: Backfill de órfãos existentes precisa live count.

## QLMED-DATA-005 — 80 Float monetários; sidecars Decimal só em duplicata e a leitura ignora Decimal
- severidade: medium | status: confirmed | confiança: high
- local: prisma/schema.prisma:576 (InvoiceDuplicata)
- invariante: Dinheiro com precisão decimal no contrato ou dual-write+read Decimal.
- cenário: SPEC-004 expand; dual-write duplicata; GET financeiro lê Float.
- esperado: Read precedence Decimal ou contrato.
- observado: financeiro-duplicatas.ts:187-191; 80 Float.
- causa raiz: Expand sem contract.
- correção mínima: Ler Decimal na duplicata; plano contract.
- teste de regressão: dup_valor 0.1+0.2 via Decimal.
- risco residual: Live drift Float≠Decimal precisa query autorizada.

## QLMED-DATA-007 — Cobertura tax_totals vs item_tax pode divergir; remaining usa só totals
- severidade: medium | status: confirmed | confiança: high
- local: src/app/api/invoices/backfill-tax/route.ts:196 (remainingCount)
- invariante: NFE tem totals e items ou remaining honesto.
- cenário: upsertItemTaxes skip; remaining = NFE − tax_totals.
- esperado: remaining considera items.
- observado: invoice-tax-store.ts:120; backfill-tax route 196-200.
- causa raiz: Métrica só totals.
- correção mínima: remaining também por item_tax.
- teste de regressão: totals sem items → remaining>0.
- risco residual: NEEDS LIVE COUNT.

## QLMED-DATA-011 — GET invoice devolve xmlContent completo
- severidade: medium | status: confirmed | confiança: high
- local: src/app/api/invoices/[id]/route.ts:30 (GET)
- invariante: API não serializa XML fiscal completo salvo download explícito.
- cenário: findFirst retorna invoice inteiro incluindo xmlContent.
- esperado: Omit xmlContent na GET JSON; download dedicado.
- observado: invoices/[id]/route.ts:30-42.
- causa raiz: Detalhe = row Prisma.
- correção mínima: select sem xmlContent.
- teste de regressão: GET details sem xmlContent; download ainda tem.
- risco residual: page-client pode depender do campo.

## QLMED-DATA-012 — Sem TTL em AccessLog, clicks, SyncLog, caches, xmlContent
- severidade: low | status: confirmed | confiança: high
- local: prisma/schema.prisma:137 (AccessLog)
- invariante: Dado operacional tem retenção.
- cenário: Sem expires.
- esperado: Política de retenção.
- observado: schema AccessLog/NotificationClick/SyncLog/CnpjCache.
- causa raiz: Append-only sem GC.
- correção mínima: Job de purge + política.
- teste de regressão: n/a até política.
- risco residual: DPO precisa definir prazos.

## QLMED-DATA-013 — scripts/backfill-tax.ts faz CRUD satélite com $executeRawUnsafe
- severidade: medium | status: confirmed | confiança: high
- local: scripts/backfill-tax.ts:22 ($executeRawUnsafe)
- invariante: CRUD satélite via Prisma (ADR-0006).
- cenário: Placeholders $1..n; SELECT invoices sem companyId.
- esperado: Usar stores Prisma.
- observado: scripts/backfill-tax.ts:22-157.
- causa raiz: Script legado.
- correção mínima: Apontar para invoice-tax-store ou deletar.
- teste de regressão: rg executeRawUnsafe scripts/ vazio ou allowlist.
- risco residual: n/a

## QLMED-FISCAL-006 — Assinatura XML declara C14N mas o digest é substring UTF-8
- severidade: high | status: confirmed | confiança: high
- local: src/lib/nfe-emission/xml-sign.ts:21 (signNfeXml)
- invariante: Digest XMLDSig = SHA-1 da infNFe canonicalizada C14N 1.0.
- cenário: CanonicalizationMethod no SignedInfo; digest=sha1(match infNFe); SignedInfo assinado como string.
- esperado: xml-c14n de infNFe e SignedInfo; vetor golden oficial.
- observado: xml-sign.ts:4-34; teste só exige tags <Signature>.
- causa raiz: Implementação ad hoc em vez de C14N.
- correção mínima: Canonicalizar antes do SHA-1; golden digest.
- teste de regressão: Vetor com infNFe known-digest (homologação) sem envio SEFAZ.
- risco residual: RSA-SHA1 é o algoritmo da NF-e 4.00.

## QLMED-INFO-002 — Company.userId ON DELETE CASCADE apagaria o tenant; não há DELETE de User na API
- severidade: info | status: accepted | confiança: high
- local: prisma/schema.prisma:155 (Company.userId)
- invariante: Apagar usuário não apaga o universo fiscal.
- cenário: onDelete Cascade User→Company→Invoice. API só PATCH status. deleteMany só em testes de integração.
- esperado: Restrict no userId da Company.
- observado: schema.prisma:149-155; users/[id] só PATCH.
- causa raiz: Owner original do single-company.
- correção mínima: onDelete Restrict.
- teste de regressão: user.delete falha se company existe.
- risco residual: Scripts manuais.
