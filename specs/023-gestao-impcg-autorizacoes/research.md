# Research: SPEC-023

## 1. Leitura das caixas

**Decision**: Graph app-only (`client_credentials` +
`https://graph.microsoft.com/.default`) nas caixas
`marcelo@qlmed.com.br` e `flavio@qlmed.com.br`. Autorização pelo
Exchange **RBAC for Applications** (`Application Mail.Read` no grupo
`QLMED Graph Mail IMPCG`). Sem consentimento Entra de `Mail.Read`
org-wide (permissões Entra e RBAC somam).

**Rationale**: o token delegado do OneDrive (`Files.ReadWrite
User.Read`) não lê correio. `/me/messages` não existe em app-only;
usar `/users/{upn}/messages`.

**Alternatives considered**:

1. IMAP/Gmail das caixas — as caixas são Exchange; Gmail MCP desta
   sessão é conta pessoal, irrelevante.
2. Delegated `Mail.Read` por usuário — exigiria consentimento e
   refresh por caixa; pior operacionalmente.
3. Application Access Policy — substituída por RBAC for Applications.

**Query** (docs Graph v1.0):

```
GET /users/{upn}/messages
  ?$select=id,subject,receivedDateTime,from,hasAttachments,internetMessageId
  &$filter=hasAttachments eq true and from/emailAddress/address eq 'compras.impcg@gmail.com'
  &$top=50
```

Não combinar `$orderby=receivedDateTime` com esse `$filter` (risco de
`InefficientFilter`). Ordenar e paginar no cliente via
`@odata.nextLink`. Timeout por caixa. Uma caixa 403/timeout não
aborta a outra.

Anexo: `GET /users/{upn}/messages/{id}/attachments` — só
`fileAttachment` com PDF.

Pré-requisito operacional (fora do código): `IsDehydrated=False` no
tenant, depois `New-ServicePrincipal` / scope / role assignment.
Sem isso o worker registra falha e não apaga linhas.

## 2. Arquivo na pasta IMPCG

**Decision**: reusar `OneDriveConnection` de
`faturamento@qlmed.com.br` (`ensureValidOneDriveAccessToken`).
Acrescentar upload/download em `onedrive-client.ts`. PUT simples
(`:/content`) — ofícios típicos << 4 MiB. Criar a cadeia de pastas
se faltar. Path:
`1 - DOCUMENTOS/0 - AUTORIZACOES/IMPCG/OFICIO {n} {PACIENTE}.pdf`.
Nome sanitizado (sem `/` e controles). Upload falhou ⇒ não upsert
(FAIL-002).

**Rationale**: a pasta já é a do faturamento; o token já existe.

**Alternatives considered**:

1. Guardar PDF só no disco do container — some no redeploy e foge
   do arquivo da empresa.
2. Session upload Graph — necessário só acima de 4 MiB; adiar.

## 3. Leitura do ofício (scan)

**Decision**: 1) `pdftotext` (poppler). 2) Se vazio, `pdftoppm` +
`tesseract -l por`. Parser em `parse-oficio.ts` sobre texto, com
seam injetável. Fixture 17673: paciente, médico CRM 13716,
TROCA VALVAR, HOSPITAL PRONCOR, 3 itens, total `12550.00`.
Dinheiro: inteiros em centavos no parser → `Prisma.Decimal` /
`money.ts` na persistência (mesmo eixo de `Invoice.totalValue`).

**Rationale**: a amostra 17673 é scan Brother sem camada de texto.
Não há `pdf-parse` / `tesseract.js` no lockfile. Alpine de produção
já tem Chromium; somar poppler + tesseract-por.

Ofícios mais antigos usam layout `MÉDICO DR. NOME` **sem**
dois-pontos e sem linha `CRM:` (ex.: 1589, 1748, 2010, 2476). O
parser aceita esse formato além de `MÉDICO:` / `CRM:`. Coleta da
pasta re-preenche `doctorName`/`doctorCrm` nulos em `parcial`
(`fillsDoctor` / `fillsCrm`), mesmo quando o rank permanece
`parcial`.

**Alternatives considered**:

1. `tesseract.js` — pacote novo, bundle pesado. Rejeitado.
2. API de visão externa — secret, custo, fora de escopo.
3. Puppeteer/Chromium para rasterizar — pior que `pdftoppm`.

Se os binários não existirem (CI enxuto): extractor devolve vazio;
teste do parser usa texto fixture; `parseStatus=falha` no ingest
real.

## 4. Worker e lock

**Decision**: mesmo processo Next (`bootstrap.ts`), intervalo 15 min,
serviço `impcg-mail-ingest` no health. `pg_try_advisory_lock` com
chave `impcg-mail-ingest:{companyId}` (ADR-0008). “Atualizar agora”
chama a mesma função. Dev com background off ainda testa via POST.

**Rationale**: uma réplica hoje; lock evita corrida manual+timer.

**Alternatives considered**: n8n, cron systemd, worker container —
infra nova sem necessidade.

## 5. Dedup e upgrade

**Decision**: `internetMessageId` único por empresa (mesmo e-mail
nas duas caixas). `oficioNumber` único por empresa. Rank
`ok > parcial > falha`: só atualiza cabeçalho/itens se o parse novo
for melhor ou igual com campos preenchidos que o antigo não tinha.
Nunca downgrade.

## 6. Nav e ACL

**Decision**: `PAGE_GROUPS` + `VALID_PAGE_PATHS` +
`API_PREFIX_TO_PAGES` (`/api/gestao` → `/gestao/impcg`). Duplicar o
item em `SidebarNav` / `PAGE_LABELS` (o menu não deriva só de
`PAGE_GROUPS`). `usuarios` já importa `PAGE_GROUPS` — a página
aparece no picker. Middleware já resolve path via `PAGE_GROUPS`.
Viewer: GET. Editor/admin: POST sync. Admin bypass existente.
`allowedPages` vazio = legado com acesso total.

## 7. Backfill da pasta OneDrive

**Decision**: além das caixas Graph, a coleta lista os filhos da
pasta `1 - DOCUMENTOS/0 - AUTORIZACOES/IMPCG` via cliente OneDrive
já autenticado (`ensureValidOneDriveAccessToken` +
`listOneDriveChildren`). PDF já no arquivo é baixado, lido e
persistido com o `itemId` conhecido — sem `uploadOneDriveFile`.
Roda depois das caixas, inclusive se ambas falharem (403
dehydrated). Dedup por `oficioNumber`.

**Rationale**: Exchange pode estar dehydrated; o PDF 17673 já está
na pasta. A lista lê Postgres — arquivo sozinho não cria linha.

**Alternatives considered**:

1. Só e-mail — bloqueado sem Graph Mail.
2. Reenviar o PDF — desnecessário e esbarra em FAIL-002.
3. Inventar itens se OCR falhar — proibido (FAIL-003).

## Fontes

- [RBAC for Applications](https://learn.microsoft.com/en-us/exchange/permissions-exo/application-rbac)
- [List messages](https://learn.microsoft.com/en-us/graph/api/user-list-messages?view=graph-rest-1.0)
- Amostra local: ordem 17673 (scan, total R$ 12.550,00)
