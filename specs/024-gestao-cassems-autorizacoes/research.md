# Research: SPEC-024

## 1. Documento real (PDF modelo)

**Decision**: parser e spec refletem o ofício OPME CASSEMS baixado
do OneDrive do faturamento em 2026-08-30, não as colunas IMPCG.

**Arquivo**:
`CASSEMS001 - Oficio de materiais OPME autorizados 28-08-2026-133128021.pdf`
(96.870 bytes). `pdftotext -layout` extraiu 1.976 caracteres
(há camada de texto; OCR é fallback).

**Campos extraídos**:

| Campo | Valor no modelo |
|---|---|
| Tipo | Ofício de materiais OPME |
| Número de autorização | `2479325231` |
| Número do Fornecimento | `247932523` (não é a chave) |
| Paciente | DOUGLAS BARBOSA FELIPE |
| Matrícula | `0010291552010120` |
| Guia TISS | RESUMO DE INTERNACAO |
| Procedimento | `3.09.99.014-Revascularização do miocárdio sem C.E.C.` |
| Local de execução | HOSPITAL CASSEMS UNIDADE DE CAMPO GRANDE |
| Prestador solicitante | ISMAEL ESCOBAR CAPIATRA |
| CRM | vazio no modelo |
| Data/hora | 28/08/2026 13:31:30 |
| Item 1 (ordem do PDF) | SHUNT CORONARIO · ANVISA 10166360035 · qtd 3 · 520,00 / 1.560,00 |
| Item 2 | KIT DE ASPIRACAO E COLETA DE SANGUE AUTOTRANSFUSAO · REF 04257 · SORIN · ANVISA 80102511537 · qtd 1 · 3.200,00 / 3.200,00 |
| Valor total com desconto | R$ 4.760,00 = 476.000 centavos |

**Rationale**: o layout (autorização, TUSS, desconto, prestador
solicitante) diverge da ordem de fornecimento IMPCG.

**Alternatives considered**: reusar `parse-oficio` da IMPCG —
rejeitado; quebraria AC-008.

O share Graph `/shares/u!…` do link da mensagem retornou 404
(`itemNotFound`). Path real obtido listando o irmão da pasta IMPCG
no mesmo drive (`1 - DOCUMENTOS/0 - AUTORIZACOES` → `CASSEMS`,
1 PDF). Não inventar pasta.

## 2. Leitura da caixa

**Decision**: mesmo Graph app-only da SPEC-023. Uma caixa:
`joseroberto@qlmed.com.br`. Remetente:
`oficio.cconecte@cassems.com.br`. Helper parametrizado em
`graph-mail-client.ts` (`listMailboxMessagesBySender`) para não
editar `src/lib/impcg/*`.

**RBAC**: reusar o grupo `QLMED Graph Mail IMPCG` /
`qlmed-graph-mail-impcg` e **adicionar** o UPN José Roberto quando
Exchange permitir. Sem `Mail.Read` org-wide.

**Dehydrated**: se `IsDehydrated` ainda for True, a leitura da
caixa retorna 403 = FAIL-001. A feature NÃO bloqueia nisso: a
pasta ainda importa a primeira linha.

**Query**:

```
GET /users/{upn}/messages
  ?$select=id,subject,receivedDateTime,from,hasAttachments,internetMessageId
  &$filter=hasAttachments eq true and from/emailAddress/address eq 'oficio.cconecte@cassems.com.br'
  &$top=50
```

## 3. Arquivo na pasta CASSEMS

**Decision**: reusar `OneDriveConnection` de
`faturamento@qlmed.com.br`. Path confirmado:

`1 - DOCUMENTOS/0 - AUTORIZACOES/CASSEMS`

Novos PDFs (origem e-mail):
`CASSEMS {autorização} {PACIENTE}.pdf`.
Arquivo já na pasta: manter o nome; associar `oneDriveItemId`.

Não usar o carimbo `133128021` do nome do modelo como número.

Upload falhou ⇒ não upsert (FAIL-002).

## 4. Leitura do ofício

**Decision**: 1) `pdftotext`. 2) Se vazio, `pdftoppm` +
`tesseract -l por` (já na imagem, SPEC-023). Parser em
`src/lib/cassems/parse-oficio.ts`. Dinheiro: centavos inteiros →
`centsToDecimal` / `src/lib/money.ts`. Sem pacote npm novo.

## 5. Isolamento e ACL

**Decision**: `getOrCreateSingleCompany`. Sem `companyId` no
request. Prefixo API específico `/api/gestao/cassems` → página
`/gestao/cassems` (não reusar o catch-all `/api/gestao` da
IMPCG, senão quem tem só IMPCG leria CASSEMS). GET com
`requireAuth(` literal (api-route-guards).

## 6. Worker

**Decision**: `cassems-mail-ingest` no bootstrap, lock
`cassems-mail-ingest:{companyId}`. Não misturar tabelas IMPCG.
Smoke 401 do worker não reverte o app (hotfix #193 já em main).
