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

A entrega L1–L6 cobriu FR-001 a FR-009, FR-014 e a parcela de ingestão do
FR-013 (Graph, health `documentos-ingest`). A L7 cobre FR-010, FR-011, FR-012
e a parcela de alerta do FR-013 (timeout e log saneado nas chamadas à
Evolution, health `documentos-alert`). A L10 generaliza o motor para três
famílias (certidão, sanitária, carta) sobre a coluna `category`. A L11
acrescenta contrato social, documentos básicos e balanços (modo
`yearFolders`) à mesma tabela.

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
licitação precisa de: a lista fixa de 7 certidões, o arquivo vigente de cada
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
  fixa: CND Receita Federal; CRF FGTS; CNDT; CND Estadual (MS); CND Estadual
  (MT); CND Municipal — mobiliário; CND Municipal — débitos gerais. Colunas:
  Certidão, Válida até, Dias restantes, Ações. "Dias restantes" mostra o
  número vindo do servidor (`N dias` / `1 dia` / `vence hoje` /
  `vencida há N dias` / `—`); destaque visual só quando
  `daysRemaining <= 7`. Tipo sem documento não tem Ver/Baixar; o link de
  emissão (FR-017) permanece.
- **FR-003**: "Dias restantes" é calculado **no servidor**, em
  `America/Sao_Paulo`, por diferença de datas civis (não de instantes). Faixas
  e rótulos: `> 30` → "ok"; `8–30` → "atenção"; `1–7` → "urgente"; `0` → "vence
  hoje"; `< 0` → "vencida há N dias". A mesma função pura alimenta a tabela e o
  alerta (FR-010).
- **FR-004**: Ações **Ver** (popup com o PDF no visualizador da página) e
  **Baixar** (attachment) servidas por
  `GET /api/documentos/{id}/arquivo[?download=1]`, lendo o conteúdo do OneDrive
  pela conexão **nomeada** `faturamento@qlmed.com.br` — sem fallback para
  "qualquer conexão da empresa" (mesma regra do IMPCG, PRIV-002). Não abre
  noutra aba.
- **FR-006**: O documento **vigente** de um tipo é o de maior `validUntil` não
  removido. Os anteriores não aparecem na UI: certidão vencida não tem valor
  operacional depois de arquivada no OneDrive (FR-016). Continuam no banco.
- **FR-017**: Cada linha da tabela (incluindo tipo sem documento) tem um
  link direto para o sítio de emissão do órgão (`CERTIDAO_EMISSAO_URL`),
  `target="_blank"` com `rel="noopener noreferrer"`. A emissão destas
  certidões é humana; o sistema leva a pessoa ao sítio certo em um clique.

### Ingestão (fonte: OneDrive)

- **FR-005**: Um job em processo varre as 5 subpastas a cada 60 min e também
  sob demanda pelo botão "Atualizar do OneDrive" (editor+). Cada PDF vira/atualiza
  um `CompanyDocument` com upsert por `oneDriveItemId`. Classificação por pasta
  e, dentro de `Estaduais`/`Municipais`, por nome (`MATO GROSSO` sem `SUL` →
  `cnd_estadual_mt`; `MATO GROSSO DO SUL` → `cnd_estadual_ms`; `MOBILIARIO` →
  mobiliário; `gerais` → débitos gerais). Validade lida
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
- **FR-015**: A CND Estadual de Mato Grosso é um tipo próprio
  (`cnd_estadual_mt`) e aparece na tabela de certidões junto das demais, na
  ordem de FR-002, imediatamente a seguir da CND Estadual (MS). Linhas já
  gravadas como `outro` com nome de MT são reclassificadas na ingestão
  (upsert por `oneDriveItemId` recalcula `kind`); não há UPDATE SQL na
  migração.
- **FR-016**: Certidão vencida (`validUntil` anterior à data civil de hoje em
  `America/Sao_Paulo`) que tenha substituto do mesmo `kind` (não removido, com
  `validUntil` posterior) é **movida** para a pasta `Vencidas` já existente em
  `2 - CERTIDÕES` no OneDrive. Sem substituto, permanece na pasta de origem.
  Nada é apagado. Documento com `validUntil` nulo não é arquivado; documento
  com `validUntilSource = 'manual'` sem substituto também não. O item movido
  some da pasta de origem na varredura seguinte e recebe `removedAt` pelo
  caminho já existente, deixando de ser vigente. Se a pasta `Vencidas` não
  existir, o ciclo de arquivo é fail-closed (não arquiva nada; não cria a
  pasta). Famílias fechadas (certidão, sanitária) arquivam por `kind`; a
  família aberta (carta) arquiva por fabricante extraído do nome, na pasta
  `Vencidas` já existente em `7 - CARTA COMERCIALIZAÇÃO`. Tipo com
  `expira: false` (AFE) nunca é arquivado por vencimento.

### Famílias (L10)

- **FR-018**: A página `/cadastro/documentos` tem três cards `Section` na
  mesma rota: **Certidões** (aberto), **Autorizações sanitárias** (aberto) e
  **Cartas de comercialização** (recolhido). A coluna `CompanyDocument.category`
  (`certidao` | `sanitaria` | `carta`) é o eixo: escrita na ingestão/upload e
  lida na listagem, no alerta e no arquivo. O motor
  (`ingest`/`list`/`alerts`/`upload`/`onedrive-port`) itera
  `DOCUMENTOS_FAMILIES`; acrescentar uma quarta família custa uma entrada
  nessa tabela, não um ficheiro novo.
- **FR-019**: A família `sanitaria` é lista fechada, uma linha por tipo, pasta
  `1 - DOCUMENTOS/1 - QL MED/1 - AUTORIZAÇÃO RELACIONADO A SAUDE`:
  alvará de funcionamento (Prefeitura); alvará/licença sanitária; licença
  sanitária de veículo; CRF (conselho); controle de pragas; AFE (ANVISA).
  **A AFE não vence.** O tipo declara `expira: false`: a linha aparece (Ver /
  Baixar), a coluna de dias restantes diz "não vence", e **nunca gera alerta**
  nem arquivamento por validade. A data no nome de
  `AFE - EMITIDO EM 06.01.2026.pdf` é a da consulta impressa, não validade —
  a ingestão não a grava. Um contador falso neste documento (interdição da
  empresa) é pior do que não ter contador.
- **FR-020**: A família `carta` é conjunto aberto: uma linha por ficheiro
  (fabricante extraído do nome), pasta
  `1 - DOCUMENTOS/1 - QL MED/7 - CARTA COMERCIALIZAÇÃO`. Ordenação por dias
  restantes, sem data no fim. Nome sem data → "Sem data" na validade e
  **não alerta**. Validade entra só pelo lápis (`validUntilSource='manual'`).
  Não se inventa data. A pasta `Vencidas` já existente serve para arquivo.
- **FR-021**: Limiares de alerta são por família, não globais:
  certidão `[30, 15, 7, 3, 1, 0]` (inalterado); sanitária
  `[90, 60, 30, 15, 7, 0]` — o 60 vem da observação II da Licença Sanitária
  nº 87858 ("A renovação deverá ser requerida até 60 (sessenta) dias antes
  do término de sua validade"); carta `[60, 30, 15, 7]`.
- **FR-022**: Classificação sanitária pelo nome (sem acento, sem caixa), nesta
  ordem: `PROTOCOLO` ou `PUBLICACAO DIARIO` → `outro` (trâmite, não vigente);
  `AFE` → `afe_anvisa`; `PRAGAS` → `controle_pragas`; `VEICULO` e `SANITARIA`
  → `licenca_sanitaria_veiculo`; `LICENCA SANITARIA` ou `ALVARA LICENCA` →
  `licenca_sanitaria`; `ALVARA` e `PREFEITURA` → `alvara_funcionamento`;
  `CRF` → `crf_conselho`. A ingestão só lê PDF (`.docx` não entra).
- **FR-023**: Os três cards reutilizam a mesma tabela (colunas, popup Ver,
  Baixar, lápis, link de emissão quando existir). A certidão não muda de
  comportamento. Sem parser de conteúdo de PDF e sem dependência nova.

### Famílias L11 (contrato social, documentos básicos, balanços)

- **FR-024**: Família `societario`, pasta
  `1 - DOCUMENTOS/1 - QL MED/3 - CONTRATO SOCIAL`, modo `closed`, scan
  `root`, limiares vazios, card **Contrato social** recolhido. Tipos, todos
  com `expira: false`: constituição; última alteração; consolidado. Sem
  alerta, sem contador, sem arquivo por vencimento.

- **FR-025**: Família `basicos`, pasta
  `1 - DOCUMENTOS/1 - QL MED/0 - DOCUMENTOS BÁSICOS`, `archiveFolder`
  `Vencidos` (masculino), modo `closed`, scan `root`, limiares vazios, card
  **Documentos básicos** recolhido. Tipos, todos com `expira: false`: Cartão
  CNPJ; Inscrição Municipal; Inscrição Estadual; SISCOMEX RADAR; Cadastro
  e-CJUR; Dados cadastrais. `expira: false` não ignora a data do nome: o
  Cartão CNPJ vigente é o de maior data (31.08.26 entre 13.11.25 / 16.03.26
  / 31.08.26). A ingestão só lê PDF (`.docx` não entra).

- **FR-026**: Família `balanco`, pasta
  `1 - DOCUMENTOS/1 - QL MED/4 - BALANÇOS`, scan `yearFolders`. A unidade é
  a subpasta `BALANÇO YYYY` (uma linha por ano, `kind: balanco_anual`,
  `oneDriveItemId` da pasta, `validUntil` nulo). Subpasta que não casa é
  ignorada. Ficheiro solto `BALANÇO YYYY.zip` (ou `.pdf`) no raiz só cria
  linha se o ano ainda não tem pasta. Ruído (`ECF`, `Faturamento`, `.xls`)
  é ignorado. Não se lê o ZIP nem o conteúdo da pasta. Card **Balanços**
  recolhido, colunas **Ano** e ação **Abrir no OneDrive** (nova aba). Sem
  coluna de prazo, sem Ver, sem upload, sem lápis de validade.

- **FR-027**: `CompanyDocument.webUrl` (nullable) é persistido na ingestão
  de todas as famílias. Balanço usa-o para abrir a pasta no OneDrive.

- **FR-028**: Classificação por nome (sem acento, sem caixa). Societário:
  `CONSTITUICAO`+`ALTERACAO` → consolidado; `ALTERACAO` → alteração;
  `CONSTITUICAO` → constituição. A ordem importa:
  `CONTRATO SOCIAL- CONSTITUIÇÃO + ULTIMA ALTERAÇÃO.pdf` é consolidado.
  Básicos: `CARTAO CNPJ` | `INSCRICAO MUNICIPAL` | `INSCRICAO ESTADUAL` |
  `SISCOMEX` | `E-CJUR`/`ECJUR` | `DADOS CADASTRAIS`.

- **FR-029**: Se o OneDrive não tiver a pasta de uma família
  (`pasta não encontrada`), a ingestão **não aborta** o ciclo. As outras
  famílias continuam; as linhas da família não enumerada **não** recebem
  `removedAt`. Falta de capacidade na porta (`listChildren` ausente) continua
  abortando — isso não pode parecer pasta vazia. O estado grava
  `lastSuccessAt` e um `lastError` âmbar com as famílias saltadas.

## Acceptance Criteria

- **AC-001** (FR-001/002/009/017): usuário com `/cadastro/documentos` em
  `allowedPages` vê a página no menu e a tabela com 7 linhas na ordem fixa,
  colunas Certidão / Válida até / Dias restantes / Ações, e um link de
  emissão por linha; usuário sem a página recebe 403 na página e em
  `/api/documentos`.
- **AC-002** (FR-003): `daysRemaining('2026-09-04', '2026-09-29') === 25`;
  `('2026-09-04','2026-09-04') === 0`; `('2026-09-04','2026-08-13') === -22`;
  rótulos conforme faixas; teste cobre virada de dia em SP vs UTC.
- **AC-003** (FR-005): fixture com os 24 nomes reais da pasta (listados em
  `PLAN.md`) classifica 100% e extrai validade em 23; o sem ano dá `null`.
- **AC-004** (FR-004): `GET /api/documentos/{id}/arquivo` sem sessão → 401;
  com sessão sem página → 403; com página → 200 `application/pdf`; com
  `download=1` → `Content-Disposition: attachment`.
- **AC-005** (FR-006/005b): duas linhas do mesmo tipo → a de maior
  `validUntil` é a vigente; linha com `removedAt` nunca é vigente. A
  listagem da página não inclui histórico nem arquivos `kind=outro`.
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
- **AC-011** (FR-015): `classifyDocument('Estaduais', 'CERTIDÃO ESTADUAL DO
  MATO GROSSO 13.08.26.pdf') === 'cnd_estadual_mt'`; o mesmo nome com
  `MATO GROSSO DO SUL` continua `cnd_estadual_ms`. A fixture de 24 nomes
  classifica as 4 linhas de MT como `cnd_estadual_mt`. Uma linha já gravada
  com `kind = 'outro'` e nome de MT passa a `cnd_estadual_mt` na varredura
  seguinte (mesmo `oneDriveItemId`).
- **AC-012** (FR-016):
  (a) só arquiva quando `validUntil` é anterior a hoje (data civil em
  `America/Sao_Paulo`); vence hoje permanece;
  (b) só arquiva se existir outro documento do mesmo `kind`, não removido,
  com `validUntil` posterior — sem substituto, a vencida fica;
  (c) nunca arquiva `validUntilSource = 'manual'` sem substituto; nunca
  arquiva `validUntil` nulo;
  (d) o movimento é `moveOneDriveItem` para `Vencidas`; nada é apagado;
  (e) cada movimento é registado em log com `kind` e nome do ficheiro; a
  ingestão devolve a contagem em `arquivados`;
  (f) na varredura seguinte o item já não está na pasta de origem, recebe
  `removedAt` e não é vigente. Pasta `Vencidas` ausente → `arquivados = 0`
  e a ingestão não falha.
- **AC-013** (FR-018/023): a listagem devolve `certidoes` (7), `sanitaria`
  (6 tipos fechados) e `cartas` (N ficheiros). A página tem três `Section`
  com esses títulos; cartas nasce recolhida.
- **AC-014** (FR-019): `kindExpires('afe_anvisa') === false`; ingestão de
  `AFE - EMITIDO EM 06.01.2026.pdf` grava `validUntil = null`; o tick de
  alerta com AFE a 30 dias da data do nome envia 0. Controlo negativo: pôr
  `expira: true` na AFE faz o teste "AFE nunca alerta" falhar.
- **AC-015** (FR-021): `thresholdDue(90, [], sanitaria) === 90`;
  `thresholdDue(60, [90], sanitaria) === 60`; os limiares da certidão não
  disparam em 90 dias. Controlo negativo: copiar os limiares da certidão
  para a sanitária faz o teste 90/60 falhar.
- **AC-016** (FR-020): carta `Carta Comercialização TECHIMPORT.pdf` fica
  sem `validUntil` e o tick não envia. Controlo negativo: gravar validade
  inventada faz o teste "carta sem data não alerta" falhar.
- **AC-017** (FR-022): a fixture dos nomes reais da pasta sanitária
  classifica AFE, pragas, veículo, licença, alvará de prefeitura, CRF e
  protocolo/publicação (outro); `PUBLICAÇÃO DIARIO OFICIAL AFE` é `outro`,
  não `afe_anvisa`.
- **AC-018** (FR-024/028): `CONTRATO SOCIAL- CONSTITUIÇÃO + ULTIMA
  ALTERAÇÃO.pdf` classifica `contrato_social_consolidado`. Controlo
  negativo: inverter a ordem da classificação faz o teste falhar com
  `constituicao`.
- **AC-019** (FR-025): três Cartões CNPJ 13.11.25 / 16.03.26 / 31.08.26 →
  a linha mostra 31.08.26; `kindExpires('cartao_cnpj') === false`;
  `thresholds` da família vazios. Controlo negativo: `expira: true` no
  Cartão CNPJ faz o teste "documentos básicos não alertam" falhar.
- **AC-020** (FR-026): ingestão de pastas 2024/2025/2026 + zip 2026
  duplicado + zip 2013 sem pasta + ruído → 4 linhas (uma por ano).
  Controlo negativo: listar ficheiros em vez de subpastas faz o teste
  "uma linha por ano" falhar.
- **AC-021** (FR-026/027): o card Balanços não tem colunas "Válida até" /
  "Dias restantes" nem botão Ver; a ação é um link `webUrl` "Abrir no
  OneDrive" com `target=_blank` `rel=noopener noreferrer`.
- **AC-022** (FR-029): após ingestão com Contrato Social presente, um ciclo
  em que `listPdfs` da pasta societário lança `pasta não encontrada` devolve
  `skippedFamilies=['societario']`, mantém `removedAt` nulo no contrato e
  nas certidões, e atualiza `lastSuccessAt`. Controlo negativo: porta sem
  `listChildren` continua a abortar.

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
- Outras categorias ainda não modeladas (CRT CREA, falência, protestos):
  entram como nova entrada em `DOCUMENTOS_FAMILIES`, não nesta folha.
- Parser de validade no conteúdo do PDF.
- E-mail e push para estes avisos.

## Applicable ADRs

ADR-0001 (isolamento de empresa), ADR-0003/0008 (scheduler em processo com
advisory lock), ADR-0010 (destino WhatsApp = grupo), ADR-0007 (banco canônico).
Nenhum ADR novo: escolhas locais e reversíveis ficam no plano.

## Test strategy

Unit (vitest, sem banco): classificação e validade (fixture real), dias
restantes, resolvedor de destino WhatsApp, seleção de limiares, montagem de
legenda, vigente (a listagem não tem histórico). Guard de rotas: o scan automático de
`api-route-guards.test.ts` cobre as rotas novas. ACL: caso novo em
`acl-default-deny.test.ts` para `/api/documentos`. Integração (opcional,
`RUN_DB_INTEGRATION_TESTS=1`): upsert por `oneDriveItemId` e `removedAt`.
Smoke manual no preview `:3002` com a conexão real de `faturamento@`.
