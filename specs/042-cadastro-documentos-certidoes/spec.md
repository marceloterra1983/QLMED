---
id: SPEC-042
status: approved
owner: QLMED
affected_modules:
  - navigation
  - cadastro-documentos
  - onedrive-client
  - whatsapp-evolution
  - bootstrap
---

# Feature Specification: Cadastro › Documentos — Certidões com validade e aviso por WhatsApp

**Feature Branch**: `feat/cadastro-documentos-certidoes`

**Created**: 2026-09-04

**Status**: Approved (dono mandou executar L1 em 2026-09-04; perguntas 1–3 do PLAN adiadas para L7)

**Input**: Pedido do dono (2026-09-04): "criar uma página Documentos dentro de
Cadastro no qual deve ter uma sessão de Certidões e colocar estas certidões na
forma de tabela, permitindo visualizar e baixar os arquivos, assim como data de
vencimento e quantos dias faltam; depois começar a desenvolver uma atualização
automática e enviar por WhatsApp quando ficar pronto."

## Problem

As certidões de regularidade da QL MED (Receita Federal, FGTS, CNDT, Estadual
MS, Municipal) vivem no OneDrive de `faturamento@qlmed.com.br`, em
`1 - DOCUMENTOS/1 - QL MED/2 - CERTIDÕES/<pasta>`. Ninguém vê a validade sem
abrir pasta por pasta; hoje (04/09/2026) a auditoria manual encontrou uma
certidão vencida há 22 dias sem que ninguém soubesse. Quem monta envelope de
licitação precisa de: a lista fixa de 5 certidões, o arquivo vigente de cada
uma, a validade, quantos dias faltam, e um aviso antes de vencer.

## Fatos verificados na fonte (2026-09-04)

| Pasta no OneDrive | Certidão | Convenção de nome observada |
|---|---|---|
| `Federais` | CND Receita Federal | `CERTIDAO RECEITA FEDERAL dd.MM.yy - QL MED.pdf` |
| `FGTS` | CRF FGTS | `CERTIDÃO FGTS dd.MM.yy QL MED.pdf` |
| `Débitos Trabalhistas` | CNDT | `CERTIDÃO DEBITOS TRABALHISTA dd.MM.yy.pdf` |
| `Estaduais` | CND Estadual **MS** (e também MT, estado diferente) | `CERTIDAO ESTADUAL dd.MM.yy QL MED.pdf` / `CERTIDÃO ESTADUAL DO MATO GROSSO dd.MM.yy.pdf` |
| `Municipais` | CND Municipal (mobiliário **e** débitos gerais) | `CERTIDAO NEGATIVA DE DEBITOS MOBILIARIO dd.MM.yy.pdf` / `certidão débitos gerais val. dd-MM-yyyy.pdf` |

A data no nome é a **validade** (conferido abrindo dois PDFs: a estadual MS diz
"válida até sessenta dias a contar da expedição", emitida 13/08 → 12/10, nome
`12.10.26`; a de MT diz "Certidão válida até: 13/08/2026", nome `13.08.26`).
Nomes de arquivo podem estar em Unicode NFD (`certidão`): a chave de
identidade é o `id` do item no Graph, nunca o nome.

Existe um arquivo sem ano (`... MOBILIARIO 05.04.pdf`): a extração precisa
falhar de forma visível, não chutar.

## Requirements

### Página e tabela

- **FR-001**: Existe a página `/cadastro/documentos`, no grupo **Cadastros** da
  navegação (`PAGE_GROUPS`, `PAGE_LABELS`), com a seção **Certidões**.
- **FR-002**: A seção mostra uma tabela com **uma linha por tipo**, nesta ordem
  fixa: CND Receita Federal; CRF FGTS; CNDT; CND Estadual (MS); CND Municipal —
  mobiliário; CND Municipal — débitos gerais. Colunas: Certidão, Arquivo,
  Válida até, Dias restantes, Ações. Tipo sem documento mostra "Não encontrada"
  e nenhuma ação.
- **FR-003**: "Dias restantes" é calculado **no servidor**, em
  `America/Sao_Paulo`, por diferença de datas civis (não de instantes). Faixas
  e rótulos: `> 30` → "ok"; `8–30` → "atenção"; `1–7` → "urgente"; `0` → "vence
  hoje"; `< 0` → "vencida há N dias". A mesma função pura alimenta a tabela e o
  alerta (FR-010).
- **FR-004**: Ações **Ver** (inline) e **Baixar** (attachment) servidas por
  `GET /api/documentos/{id}/arquivo[?download=1]`, lendo o conteúdo do OneDrive
  pela conexão **nomeada** `faturamento@qlmed.com.br` — sem fallback para
  "qualquer conexão da empresa" (mesma regra do IMPCG, PRIV-002).
- **FR-006**: O documento **vigente** de um tipo é o de maior `validUntil` não
  removido. Os anteriores ficam acessíveis num histórico expansível por linha.

### Ingestão (fonte: OneDrive)

- **FR-005**: Um job em processo varre as 5 subpastas a cada 60 min e também
  sob demanda pelo botão "Atualizar do OneDrive" (editor+). Cada PDF vira/atualiza
  um `CompanyDocument` com upsert por `oneDriveItemId`. Classificação por pasta
  e, dentro de `Estaduais`/`Municipais`, por nome (`MATO GROSSO` sem `SUL` →
  `outro`; `MOBILIARIO` → mobiliário; `gerais` → débitos gerais). Validade lida
  do nome: **última** data `dd.MM.yy`, `dd.MM.yyyy` ou `dd-MM-yyyy`; sem match →
  `validUntil = null`, `validUntilSource = null`, linha marcada "Sem data".
- **FR-005b**: Item que sumiu da pasta recebe `removedAt` (não é apagado do
  banco). Item renomeado mantém a linha (mesmo `oneDriveItemId`) e atualiza
  nome e validade extraída, exceto quando `validUntilSource = 'manual'`.
- **FR-007**: Upload manual (editor+): PDF ≤ 5 MiB, tipo escolhido, validade
  informada. O arquivo é gravado na subpasta do tipo no OneDrive com nome
  padronizado da tabela acima (`dd.MM.yy` da validade informada) e a linha é
  criada na mesma requisição com `validUntilSource = 'manual'`. Sem OneDrive
  conectado, o upload é recusado com mensagem clara — não existe segundo
  depósito de arquivo.
- **FR-008**: Editar validade (editor+) via `PATCH /api/documentos/{id}` grava
  `validUntilSource = 'manual'`; a ingestão não sobrescreve.

### Autorização e isolamento

- **FR-009**: Página gated por `allowedPages` (`/cadastro/documentos`).
  `API_PREFIX_TO_PAGES` mapeia `/api/documentos` → `['/cadastro/documentos']`.
  Leitura: qualquer papel com a página; escrita (sync, upload, PATCH):
  `editor`+. `companyId` sempre do helper canônico (`getSingleCompany`), nunca
  do request. `admin` continua com bypass de papel.

### Alerta por WhatsApp

- **FR-010**: Um job diário às 08:00 `America/Sao_Paulo` (tick a cada 60 s com
  chave de slot, como `sync-scheduler`) percorre o documento vigente de cada
  tipo e envia **o PDF como documento** com legenda quando `diasRestantes` está
  em `{30, 15, 7, 3, 1, 0}` ou, vencido, a cada 7 dias (`-7, -14, ...`).
  Idempotência por `(documento, limiar)` em `alertedThresholds Int[]`; o
  limiar entra no array **antes** do envio (sem duplicar em reinício).
  Tipo **sem documento** gera uma linha de texto no mesmo aviso diário.
- **FR-011**: Quando a ingestão encontra um documento cujo `validUntil` supera
  o vigente anterior do mesmo tipo, envia o PDF com legenda "renovada — válida
  até dd/MM/yyyy" uma única vez (`renewalNotifiedAt`). Sem vigente anterior
  (primeira carga) não avisa: backfill não é evento.
- **FR-012**: Canal **desligado por padrão**. Exige `DOCUMENTOS_WHATSAPP_ENABLED=true`,
  `DOCUMENTOS_WHATSAPP_GROUP_JID` (`@g.us`) e config Evolution presente.
  Faltando qualquer peça: silencioso, sem erro, sem fallback para o grupo
  fiscal (mesma decisão do IMPCG). Envio via `sendWhatsAppDocument` existente.

### Operação e segurança

- **FR-013**: Nada do PDF, da legenda ou de tokens entra em log. Chamadas ao
  Graph e à Evolution têm timeout limitado e erro registrado em
  `CompanyDocumentIngestState.lastError` (mensagem saneada). O serviço se
  registra em `background-service-health` como `documentos-ingest` e
  `documentos-alert`, e respeita `QLMED_DISABLE_BACKGROUND_SERVICES`.
- **FR-014**: Nenhum runtime DDL: schema por migração Prisma versionada.

## Acceptance Criteria

- **AC-001** (FR-001/002/009): usuário com `/cadastro/documentos` em
  `allowedPages` vê a página no menu e a tabela com 6 linhas na ordem fixa;
  usuário sem a página recebe 403 na página e em `/api/documentos`.
- **AC-002** (FR-003): `daysRemaining('2026-09-04', '2026-09-29') === 25`;
  `('2026-09-04','2026-09-04') === 0`; `('2026-09-04','2026-08-13') === -22`;
  rótulos conforme faixas; teste cobre virada de dia em SP vs UTC.
- **AC-003** (FR-005): fixture com os 24 nomes reais da pasta (listados em
  `PLAN.md`) classifica 100% e extrai validade em 23; o sem ano dá `null`.
- **AC-004** (FR-004): `GET /api/documentos/{id}/arquivo` sem sessão → 401;
  com sessão sem página → 403; com página → 200 `application/pdf`; com
  `download=1` → `Content-Disposition: attachment`.
- **AC-005** (FR-006/005b): duas linhas do mesmo tipo → a de maior
  `validUntil` é a vigente; linha com `removedAt` nunca é vigente.
- **AC-006** (FR-010): com `now` = 25 dias antes da validade não envia; = 30
  envia uma vez e não repete no tick seguinte; = -7 envia; envio recebe o PDF
  e a legenda contém tipo, arquivo e "vence em N dias"/"vencida há N dias".
- **AC-007** (FR-012): sem `DOCUMENTOS_WHATSAPP_GROUP_JID` o resolvedor devolve
  `null` e nenhuma chamada à Evolution acontece; JID de telefone (não `@g.us`) é
  rejeitado.
- **AC-008** (FR-011): ingestão que substitui vigente 12.10.26 por 12.12.26
  envia uma renovação; reexecução não reenvia; primeira carga não envia.
- **AC-009** (FR-007): upload de 6 MiB → 413/400 com mensagem; upload válido
  cria item no OneDrive (porta mockada) e linha com `validUntilSource='manual'`.
- **AC-010** (FR-013/014): `npm run db:migrate:verify` e `db:reconcile:verify`
  passam; nenhum `log.*` recebe `content`, `caption` ou token (teste de
  grep/spy como em `whatsapp-evolution-egress.test.ts`).

## Non-functional

- Página lista do banco, nunca do OneDrive em tempo de requisição (p95 < 500 ms).
- Ingestão completa das 5 pastas < 30 s; abortada por lock advisory se já
  houver uma em curso (`documentosIngestLockKey`).
- UI passa `npm run ui:check` (tokens, dialogs, empty state via `EmptyState`).

## Out of scope (explícito)

- **Emissão automática nos órgãos** (Receita, Caixa, TST, SEFAZ-MS, Prefeitura):
  fica para spike `S1` em `PLAN.md`; captcha e login gov.br tornam a
  viabilidade incerta por órgão. Este spec entrega "atualização automática" no
  sentido: o que a contabilidade coloca no OneDrive aparece sozinho, com aviso.
- Outras categorias (alvará, CRT CREA, falência, protestos): o modelo tem
  `category`, a UI só mostra `certidao`.
- Certidão estadual de MT: dono decidiu que a exigida é MS; MT cai em `outro`
  e só aparece em "Outros arquivos na pasta" (colapsado).
- E-mail e push para estes avisos.

## Applicable ADRs

ADR-0001 (isolamento de empresa), ADR-0003/0008 (scheduler em processo com
advisory lock), ADR-0010 (destino WhatsApp = grupo), ADR-0007 (banco canônico).
Nenhum ADR novo: escolhas locais e reversíveis ficam no plano.

## Test strategy

Unit (vitest, sem banco): classificação e validade (fixture real), dias
restantes, resolvedor de destino WhatsApp, seleção de limiares, montagem de
legenda, vigente/histórico. Guard de rotas: o scan automático de
`api-route-guards.test.ts` cobre as rotas novas. ACL: caso novo em
`acl-default-deny.test.ts` para `/api/documentos`. Integração (opcional,
`RUN_DB_INTEGRATION_TESTS=1`): upsert por `oneDriveItemId` e `removedAt`.
Smoke manual no preview `:3002` com a conexão real de `faturamento@`.
