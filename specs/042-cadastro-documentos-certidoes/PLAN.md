# PLAN — SPEC-042 Cadastro › Documentos (Certidões)

Modo unlazy **orquestrado**: uma folha por vez, contexto fresco por folha,
gates em `gates/L*.md`. O executor lê `BRIEF-EXECUTOR.md` primeiro.

## Estado do repositório no início

- Worktree: `/home/marce/qlmed/.worktrees/042-certidoes`, branch
  `feat/cadastro-documentos-certidoes`, base `origin/main` @ `368b43c`.
- `node_modules` **não** existe aqui. Não crie symlink para `../app/node_modules`
  (cria `app/` fantasma e o build passa compilando nada). Rode `npm ci` neste
  worktree e depois `npx prisma generate`.
- `/home/marce/qlmed/app` é o worktree de **produção** (`main`). Não edite lá.
- Preview canônico de UI: worktree `/home/marce/qlmed/.worktrees/preview`,
  porta **3002** (unit `qlmed-dev-preview`). Feature com UI valida ali antes de
  PR. Não suba outro Next em 3000/3001/3003.

## Contratos (fixos antes do fan-out)

### Enum e modelo (L2)

```prisma
enum CompanyDocumentKind {
  cnd_federal
  crf_fgts
  cndt
  cnd_estadual_ms
  cnd_municipal_mobiliario
  cnd_municipal_gerais
  outro
}

model CompanyDocument {
  id                String              @id @default(cuid())
  companyId         String
  company           Company             @relation(fields: [companyId], references: [id], onDelete: Cascade)
  category          String              @default("certidao")
  kind              CompanyDocumentKind
  fileName          String
  oneDriveItemId    String              @unique
  oneDriveAccount   String
  folderName        String
  fileSize          Int?
  lastModifiedAt    DateTime?
  validUntil        DateTime?           @db.Date
  validUntilSource  String?             // 'filename' | 'manual' | null
  removedAt         DateTime?
  alertedThresholds Int[]               @default([])
  renewalNotifiedAt DateTime?
  createdAt         DateTime            @default(now())
  updatedAt         DateTime            @updatedAt

  @@index([companyId, kind, validUntil])
  @@index([companyId, removedAt])
}

model CompanyDocumentIngestState {
  companyId     String   @id
  company       Company  @relation(fields: [companyId], references: [id], onDelete: Cascade)
  lastSuccessAt DateTime?
  lastError     String?
  lastErrorAt   DateTime?
  lastAlertDay  String?   // 'YYYY-MM-DD' em America/Sao_Paulo — idempotência do job diário
  updatedAt     DateTime @updatedAt
}
```

`Company` ganha `documents CompanyDocument[]` e `documentIngestState CompanyDocumentIngestState?`.
Migração: `prisma/migrations/2026MMDDhhmmss_company_document/`.

### Constantes (`src/lib/documentos/constants.ts`)

```ts
export const DOCUMENTOS_ONEDRIVE_ACCOUNT = 'faturamento@qlmed.com.br';
export const DOCUMENTOS_ONEDRIVE_ROOT = '1 - DOCUMENTOS/1 - QL MED/2 - CERTIDÕES';
export const DOCUMENTOS_PAGE_PATH = '/cadastro/documentos';
export const DOCUMENTOS_INGEST_INTERVAL_MS = 60 * 60 * 1000;
export const DOCUMENTOS_ALERT_HOUR_LOCAL = 8;            // America/Sao_Paulo
export const DOCUMENTOS_ALERT_THRESHOLDS = [30, 15, 7, 3, 1, 0] as const;
export const DOCUMENTOS_EXPIRED_REPEAT_DAYS = 7;
export const DOCUMENTOS_UPLOAD_MAX_BYTES = 5 * 1024 * 1024;
export const CERTIDAO_KINDS_ORDER = [ 'cnd_federal','crf_fgts','cndt','cnd_estadual_ms','cnd_municipal_mobiliario','cnd_municipal_gerais' ] as const;
export const CERTIDAO_LABEL: Record<Kind,string> = { cnd_federal:'CND Receita Federal', crf_fgts:'CRF FGTS', cndt:'CNDT (Débitos Trabalhistas)', cnd_estadual_ms:'CND Estadual (MS)', cnd_municipal_mobiliario:'CND Municipal — mobiliário', cnd_municipal_gerais:'CND Municipal — débitos gerais', outro:'Outro' };
export const CERTIDAO_FOLDER: Record<Exclude<Kind,'outro'>,string> = { cnd_federal:'Federais', crf_fgts:'FGTS', cndt:'Débitos Trabalhistas', cnd_estadual_ms:'Estaduais', cnd_municipal_mobiliario:'Municipais', cnd_municipal_gerais:'Municipais' };
export const CERTIDAO_UPLOAD_NAME: Record<Exclude<Kind,'outro'>,(ddMMyy:string)=>string> = { cnd_federal: d=>`CERTIDAO RECEITA FEDERAL ${d} - QL MED.pdf`, crf_fgts: d=>`CERTIDÃO FGTS ${d} QL MED.pdf`, cndt: d=>`CERTIDÃO DEBITOS TRABALHISTA ${d}.pdf`, cnd_estadual_ms: d=>`CERTIDAO ESTADUAL ${d} QL MED.pdf`, cnd_municipal_mobiliario: d=>`CERTIDAO NEGATIVA DE DEBITOS MOBILIARIO ${d}.pdf`, cnd_municipal_gerais: d=>`certidão débitos gerais val. ${d}.pdf` };
export function isDocumentosWhatsAppEnabled(): boolean;      // DOCUMENTOS_WHATSAPP_ENABLED === 'true'
export function getDocumentosWhatsAppGroupRaw(): string|null; // DOCUMENTOS_WHATSAPP_GROUP_JID, sem fallback
```

### Funções puras (`src/lib/documentos/classify.ts`, `validity.ts`) — L3

```ts
classifyDocument(folderName: string, fileName: string): CompanyDocumentKind
extractValidUntil(fileName: string): { date: string /* YYYY-MM-DD */ } | null   // ÚLTIMA data no nome; NFC-normalize antes
daysRemaining(todayLocal: string, validUntil: string): number                  // datas civis YYYY-MM-DD
statusFor(days: number | null): { key: 'ok'|'atencao'|'urgente'|'hoje'|'vencida'|'sem_data'; label: string }
selectVigente<T extends {kind, validUntil, removedAt}>(rows: T[]): Map<Kind, T>
thresholdDue(days: number, alerted: readonly number[]): number | null           // devolve o limiar a marcar, ou null
todayInSaoPaulo(now?: Date): string
```

Fixture obrigatória para os testes (nomes reais lidos da pasta em 04/09/2026):

```
Federais/CERTIDAO RECEITA FEDERAL 12.12.26 - QL MED.pdf            → cnd_federal, 2026-12-12
Federais/CERTIDAO RECEITA FEDERAL 06.07.26- QL MED.pdf             → cnd_federal, 2026-07-06
Federais/CERTIDÃO RECEITA FEDERAL 13.05.26 - QL MED.pdf            → cnd_federal, 2026-05-13
Federais/CERTIDÃO Tribunal Regional Federal da 3ª Região.pdf       → outro, null
FGTS/CERTIDÃO FGTS 29.09.26 QL MED.pdf                             → crf_fgts, 2026-09-29
FGTS/CERTIDÃO FGTS 03.09.26 QL MED.pdf                             → crf_fgts, 2026-09-03
FGTS/CERTIDÃO FGTS 09.08.26 QL MED.pdf                             → crf_fgts, 2026-08-09
FGTS/CERTIDÃO FGTS 16.07.26 QL MED.pdf                             → crf_fgts, 2026-07-16
Débitos Trabalhistas/CERTIDÃO DEBITOS TRABALHISTA 03.10.26.pdf     → cndt, 2026-10-03
Débitos Trabalhistas/CERTIDÃO DEBITOS TRABALHISTA 15.04.26.pdf     → cndt, 2026-04-15
Estaduais/CERTIDAO ESTADUAL 12.10.26 QL MED.pdf                    → cnd_estadual_ms, 2026-10-12
Estaduais/CERTIDAO ESTADUAL 20.09.26 QL MED.pdf                    → cnd_estadual_ms, 2026-09-20
Estaduais/CERTIDAO ESTADUAL 01.08.26 QL MED.pdf                    → cnd_estadual_ms, 2026-08-01
Estaduais/CERTIDAO ESTADUAL 26.06.26 QL MED.pdf                    → cnd_estadual_ms, 2026-06-26
Estaduais/CERTIDÃO ESTADUAL 18.05.26 QL MED.pdf                    → cnd_estadual_ms, 2026-05-18
Estaduais/CERTIDÃO ESTADUAL 12.04.26 QL MED.pdf                    → cnd_estadual_ms, 2026-04-12
Estaduais/CERTIDÃO ESTADUAL DO MATO GROSSO 13.08.26.pdf            → outro, 2026-08-13
Estaduais/CERTIDÃO ESTADUAL DO MATO GROSSO 06.07.26.pdf            → outro, 2026-07-06
Estaduais/CERTIDÃO ESTADUAL DO MATO GROSSO 04.06.26.pdf            → outro, 2026-06-04
Estaduais/CERTIDÃO ESTADUAL DO MATO GROSSO 08.02.26.pdf            → outro, 2026-02-08
Municipais/certidão débitos gerais val. 01-10-2026.pdf             → cnd_municipal_gerais, 2026-10-01   (nome vem em NFD do Graph)
Municipais/CERTIDAO NEGATIVA DE DEBITOS MOBILIARIO 30.09.26.pdf    → cnd_municipal_mobiliario, 2026-09-30
Municipais/CERTIDAO NEGATIVA DE DEBITOS MOBILIARIO 02.09.26.pdf    → cnd_municipal_mobiliario, 2026-09-02
Municipais/CERTIDAO NEGATIVA DE DEBITOS MOBILIARIO 05.04.pdf       → cnd_municipal_mobiliario, null (sem ano)
```

### Ingestão (`src/lib/documentos/ingest.ts`) — L4

Copiar a forma de `src/lib/impcg/folder-ingest.ts` + `ingest.ts` (porta +
store + lock + health), não a lógica de ofício. Porta:

```ts
type DocumentosFolderPort = { listPdfs(folder: string): Promise<{itemId,name,size,lastModifiedAt}[]>; downloadPdf(itemId): Promise<Buffer> }
runDocumentosIngest(companyId, port?, now?): Promise<{ scanned, upserted, removed, renewals: RenewalEvent[] }>
startDocumentosIngest(): void   // bootstrap; QLMED_DISABLE_BACKGROUND_SERVICES respeitado
```

Lock: `documentosIngestLockKey(companyId)` em `postgres-advisory-lock.ts`.
Health: `'documentos-ingest'` e `'documentos-alert'` em `BackgroundServiceName`.
Resolução de conexão: só `accountEmail = DOCUMENTOS_ONEDRIVE_ACCOUNT`; sem
fallback (diferente de `resolveImpcgOneDrive`, que tem fallback — não copiar).

### API — L5

| Rota | Método | Guarda | Corpo/Resposta |
|---|---|---|---|
| `/api/documentos` | GET | `requireAuth` + página | `{ certidoes: Row[6], outros: Row[], ingest: {lastSuccessAt,lastError} }` |
| `/api/documentos/sync` | POST | `requireEditor` + página | roda `runDocumentosIngest`; 409 se lock ocupado |
| `/api/documentos/upload` | POST | `requireEditor` + página; `formDataWithLimit` | `kind`, `validUntil`, `file` → cria no OneDrive + linha |
| `/api/documentos/[id]` | PATCH | `requireEditor` + página; zod | `{ validUntil }` → `validUntilSource='manual'` |
| `/api/documentos/[id]/arquivo` | GET | `requireAuth` + página | stream PDF; `?download=1` → attachment |

`Row = { id, kind, label, fileName, validUntil, daysRemaining, status:{key,label}, validUntilSource, history: {id,fileName,validUntil}[] }`.
Guarda de página: criar `requireDocumentosPage()` em `src/lib/documentos/access.ts`
copiando `requireImpcgPage`. Rotas só autenticam, validam e delegam.

### Alerta (`src/lib/documentos/alerts.ts`) — L7

```ts
resolveDocumentosWhatsAppTarget(config?): { jid, port } | null   // espelho de resolveImpcgWhatsAppTarget
buildExpiryCaption(row, days): string                              // sem dado sensível; tipo + arquivo + "vence em N dias"/"vencida há N dias"/"vence hoje"
runDocumentosAlertTick(companyId, now?): Promise<{ sent: number }> // roda só se slot diário 08:00 SP ainda não marcado em lastAlertDay
notifyRenewals(events: RenewalEvent[]): Promise<void>              // chamado pela ingestão
```

Marcação `alertedThresholds` **antes** do envio (falha → limiar consumido, log
de erro, sem reenvio infinito — mesmo espírito de JOB-005 do outbox).

### UI — L6

- `src/app/(painel)/cadastro/documentos/{layout.tsx,page.tsx,page-client.tsx}`
  seguindo `cadastro/clientes` (page.tsx com `dynamic(..., { ssr:false })`).
- Componentes existentes: `PageHeader`, `Card`, `Badge`, `Button`, `EmptyState`,
  `SortableTh` não é necessário (ordem fixa), `ConfirmDialog` para upload.
- Ícone em `PAGE_LABELS`: `'/cadastro/documentos': { label: 'Documentos', icon: 'verified' }`.
- Estado visual por `status.key` com as classes já usadas em
  `sistema/automacoes/page-client.tsx` (`text-emerald-600 dark:text-emerald-400`,
  `text-red-600 dark:text-red-400`, ...). Nada de pixel cru, `rounded-md`, ou pill à mão.

## Árvore

```
L0  SPEC-042 entregue em produção
├── L1  Spec aprovado + navegação/ACL              gates/L1-spec-acl.md
├── L2  Schema + migração                          gates/L2-schema.md
├── L3  Funções puras (classify/validity)          gates/L3-puras.md       (paralelo a L2)
├── L4  Ingestão OneDrive + scheduler + health     gates/L4-ingest.md
├── L5  Rotas API                                  gates/L5-api.md
├── L6  Página UI + preview :3002                  gates/L6-ui.md
├── L7  Alertas WhatsApp (diário + renovação)      gates/L7-whatsapp.md
├── L8  Integração: CI, PR, deploy autorizado      gates/L8-integracao.md
└── S1  Spike emissão automática (sem código)      gates/S1-spike-emissao.md (paralelo, independente)
```

Ordem: L1 → (L2 ‖ L3) → L4 → L5 → L6 → L7 → L8. S1 a qualquer momento.

## Decisões locais (reversíveis; não viram ADR)

- **OneDrive é o único depósito.** Não copiar bytes para o Postgres. Upload
  manual grava no OneDrive. Motivo: a contabilidade já mantém a pasta; dois
  depósitos divergem.
- **Validade do nome, não do PDF.** 23/24 arquivos reais têm a data no nome e
  ela é a validade. Parser de texto de PDF (nova dependência) fica de fora até
  o override manual se provar insuficiente.
- **Envio como documento, não texto.** `sendWhatsAppDocument` já existe e
  mandar o PDF junto com o aviso é útil; evita criar `sendText` agora.
- **Grupo próprio.** `DOCUMENTOS_WHATSAPP_GROUP_JID`; homologar num grupo de
  teste antes de apontar para o grupo real (mesma sequência do IMPCG).

## Perguntas ao dono (não bloqueiam L1–L6; bloqueiam L7 no deploy)

1. JID do grupo de WhatsApp para os avisos (teste e produção).
2. Confirmar os limiares `30, 15, 7, 3, 1, 0` e repetição semanal após vencer.
3. A conexão OneDrive de `faturamento@qlmed.com.br` já está ativa em
   Sistema › Configurações (é a mesma do IMPCG). Se o token expirou, reconectar
   antes do smoke de L4.

## Log de status (append-only)

- 2026-09-04 — plano, spec draft e gates escritos; worktree criado; nenhum código.
- 2026-09-04 — L3 funções puras classify/validity + testes da fixture 24 (SPEC-042).
- 2026-09-04 — fan-out L4/L5: contrato src/lib/documentos/ingest.ts commitado (só tipos e assinaturas); L4 (ingestão OneDrive) em feat/042-L4-ingest, L5 (rotas de API) em feat/042-L5-api, em worktrees separados — a L4 preenche os corpos, a L5 só importa.
- 2026-09-04 — L4 (b56ea00) e L5 (b03e2ee) mescladas + origin/main (traz 26c6c7e, que conserta o teste-bomba de receivedAt). tsc, lint e suíte: 1517 passed / 9 skipped / 0 failed. Gates L5-G7, L7-G8 e L8-G2 corrigidos: o pipe engolia o exit code do vitest e EXPECT /passed/ casava com "1 failed | 1508 passed" — trocado por sentinela guardada por &&.
