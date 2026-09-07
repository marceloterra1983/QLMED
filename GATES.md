# Gates: Otimização de Performance de Filtros e Consultas ao Banco

Scope: Eliminar gargalos de leitura/filtro (sync não-bloqueante, índices Postgres, contagem sem query duplicada, busca seletiva de XML e cache front-end de apelidos com AbortController).

- [x] G1: ensureLocalXmlSyncNow é não-bloqueante no GET /api/invoices
  CHECK: rg -n "ensureLocalXmlSyncNow" src/app/api/invoices/route.ts
  EXPECT: /void ensureLocalXmlSyncNow/

- [x] G2: Índices para Invoice criados no schema e migration
  CHECK: rg -n "Invoice_recipientName_idx|Invoice_companyId_type_direction_cfop_issueDate_idx" prisma/migrations/20260906230000_invoice_query_performance_indexes/migration.sql
  EXPECT: /CREATE INDEX/

- [x] G3: Contagem condicional sem query count() duplicada quando invoices.length < limit
  CHECK: rg -n "searchInvoices\.length < limit \? searchInvoices\.length" src/app/api/invoices/route.ts
  EXPECT: /searchInvoices\.length/

- [x] G4: Busca em xmlContent ignorada para termos puramente numéricos
  CHECK: rg -n "isPureDigits" src/lib/nfe/search-engine.ts
  EXPECT: /isPureDigits/

- [x] G5: Front-end com cache de apelidos e AbortController
  CHECK: rg -n "nicknamesRef|abortControllerRef" src/app/(painel)/fiscal/issued/page-client.tsx
  EXPECT: /abortControllerRef/
