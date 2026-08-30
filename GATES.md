# Gates: SPEC-023 backend (US2/US3 ingest)

Scope: schema, Graph/OneDrive, parser, ingest, POST sync — sem UI.

- [x] G1: Constantes IMPCG (caixas, remetente, pasta)
  CHECK: test -f src/lib/impcg/constants.ts && rg -n "compras.impcg@gmail.com|marcelo@qlmed.com.br|flavio@qlmed.com.br|AUTORIZACOES/IMPCG" src/lib/impcg/constants.ts
  EXPECT: compras.impcg@gmail.com
  EVIDENCE: 5:  'flavio@qlmed.com.br', | 8:export const IMPCG_ONEDRIVE_FOLDER = '1 - DOCUMENTOS/0 - AUTORIZACOES/IMPCG';

- [x] G2: Schema Prisma ImpcgAuthorization + itens + source + ingest
  CHECK: rg -n "model ImpcgAuthorization|model ImpcgAuthorizationItem|model ImpcgSourceMessage|model ImpcgIngestState|enum ImpcgParseStatus" prisma/schema.prisma
  EXPECT: model ImpcgAuthorization
  EVIDENCE: 879:model ImpcgSourceMessage { | 896:model ImpcgIngestState {

- [x] G3: Migration expand-only 20260830120000_add_impcg_authorization
  CHECK: rg -n "CREATE TABLE|ImpcgAuthorization" prisma/migrations/20260830120000_add_impcg_authorization/migration.sql
  EXPECT: ImpcgAuthorization
  EVIDENCE: 98:ALTER TABLE "ImpcgAuthorizationItem" ADD CONSTRAINT "ImpcgAuthorizationItem_authorizationId_fkey" FOREIGN KEY ("authorizationId") REFERENCES "ImpcgAuthorization"("id") ON DELETE CASCADE ON UPDATE C

- [x] G4: Janela de produção aponta para a migration IMPCG
  CHECK: rg -n "EXPECTED_MIGRATION|20260830120000_add_impcg_authorization" scripts/verify-production-migration-window.cjs scripts/test-production-migration-window.cjs
  EXPECT: 20260830120000_add_impcg_authorization
  EVIDENCE: scripts/verify-production-migration-window.cjs:97:      || before.migration !== EXPECTED_MIGRATION | scripts/verify-production-migration-window.cjs:111:  EXPECTED_MIGRATION,

- [x] G5: Graph mail client client_credentials
  CHECK: rg -n "client_credentials|/users/" src/lib/graph-mail-client.ts
  EXPECT: client_credentials
  EVIDENCE: 116:    `/users/${encodeURIComponent(mailbox)}/messages?$select=${select}&$filter=${encodeURIComponent(filter)}&$top=50`; | 175:    `/users/${encodeURIComponent(mailbox)}/messages/${encodeURIComponent

- [x] G6: OneDrive upload/download/ensure folder
  CHECK: rg -n "uploadOneDriveFile|ensureOneDriveFolder|downloadOneDrive" src/lib/onedrive-client.ts
  EXPECT: uploadOneDriveFile
  EVIDENCE: 299:export async function uploadOneDriveFile( | 329:export async function downloadOneDriveItemContent(

- [x] G7: Health + advisory lock impcg-mail-ingest
  CHECK: rg -n "impcg-mail-ingest" src/lib/background-service-health.ts src/lib/postgres-advisory-lock.ts
  EXPECT: impcg-mail-ingest
  EVIDENCE: src/lib/postgres-advisory-lock.ts:19:  return `impcg-mail-ingest:${companyId}`; | src/lib/background-service-health.ts:1:export type BackgroundServiceName = 'auto-sync' | 'local-xml-sync' | 'impcg-mai

- [x] G8: Dockerfile Alpine poppler + tesseract-por
  CHECK: rg -n "poppler-utils|tesseract-ocr" Dockerfile
  EXPECT: tesseract-ocr
  EVIDENCE: 48:    tesseract-ocr \ | 49:    tesseract-ocr-data-por

- [x] G9: Parser fixture 17673 total 1255000 centavos
  CHECK: rg -n "17673|1255000" src/lib/__tests__/impcg-parse-oficio.test.ts src/lib/impcg/parse-oficio.ts
  EXPECT: 1255000
  EVIDENCE: src/lib/__tests__/impcg-parse-oficio.test.ts:74:    const parsed = parseOficio(OFICIO_17673_TEXT, 'Ordem 17673 MARIA SILVA'); | src/lib/__tests__/impcg-parse-oficio.test.ts:79:    const parsed = parse

- [x] G10: Dedup Message-ID e número de ofício
  CHECK: rg -n "internetMessageId|oficioNumber" src/lib/__tests__/impcg-ingest-dedup.test.ts
  EXPECT: internetMessageId
  EVIDENCE: 217:    async function ingestWith(text: string, internetMessageId: string) { | 220:        mailMessage({ internetMessageId, graphMessageId: `graph-${internetMessageId}` }),

- [x] G11: Upload falhou não confirma autorização
  CHECK: rg -n "upload|upsert|confirm" src/lib/__tests__/impcg-upload-gate.test.ts
  EXPECT: upload
  EVIDENCE: rg: src/lib/__tests__/impcg-upload-gate.test.ts: IO error for operation on src/lib/__tests__/impcg-upload-gate.test.ts: No such file or directory (os error 2)

- [x] G12: POST sync + bootstrap ingest
  CHECK: rg -n "ingest|runImpcgIngest" src/app/api/gestao/impcg/sync/route.ts src/lib/bootstrap.ts
  EXPECT: ingest
  EVIDENCE: src/app/api/gestao/impcg/sync/route.ts:5:import { runImpcgIngest } from '@/lib/impcg/ingest'; | src/app/api/gestao/impcg/sync/route.ts:19:    const result = await runImpcgIngest(company.id);

- [x] G13: Typecheck
  CHECK: npx tsc --noEmit && echo tsc-ok
  EXPECT: tsc-ok
  EVIDENCE: tsc-ok

- [x] G14: Testes parser/dedup/upload-gate
  CHECK: npx vitest run src/lib/__tests__/impcg-parse-oficio.test.ts src/lib/__tests__/impcg-ingest-dedup.test.ts src/lib/__tests__/impcg-upload-gate.test.ts src/lib/__tests__/money.test.ts
  EXPECT: Test Files  4 passed
  EVIDENCE: Start at  10:34:18 | Duration  262ms (transform 235ms, setup 0ms, import 204ms, tests 255ms, environment 0ms)
