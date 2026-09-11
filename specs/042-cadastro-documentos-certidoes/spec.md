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
`yearFolders`) à mesma tabela. A L12 liga a tela: linha clicável com popup
de atualização (leitura da validade no PDF), ícones no padrão `RowActionsBase`,
compartilhar no app e tags de automação. A L13 recolhe todos os cards ao
entrar, compacta as linhas da tabela e troca o alvo do clique da linha para um
popup de gestão (resumo de datas, descrição, órgão emissor); o modal de
atualização passa a abrir por um botão dentro desse popup. A L14 acrescenta
uma varredura em lote para preencher `emitidoEm` que a ingestão não leu
(ficheiros cuja data já vinha no nome). A L15 abre e-mail livre e WhatsApp
no compartilhar, varre as caixas de José Roberto, Marcelo, Flavio e Daniele
em busca de cartas de comercialização, e lê emissão/validade no PDF das cartas
mesmo quando o texto descreve o prazo de formas diferentes.

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

- **FR-001**: Existe a página `/cadastro/documentos` (`PAGE_GROUPS`,
  `PAGE_LABELS`), com a seção **Certidões**. No sidebar (`buildNavItems`) o
  item **Documentos** fica no topo, acima do grupo **Cadastros** (sem seção
  própria); em `PAGE_GROUPS` permanece sob Cadastros para o picker de ACL.
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
  do nome: **última** data `dd.MM.yy`, `dd.MM.yyyy` ou `dd-MM-yyyy`; sem match
  → fallback FR-030 no conteúdo do PDF; se ainda assim nulo, linha "Sem data".
- **FR-005b**: Item que sumiu da pasta recebe `removedAt` (não é apagado do
  banco). Item renomeado mantém a linha (mesmo `oneDriveItemId`) e atualiza
  nome e validade extraída, exceto quando `validUntilSource = 'manual'`.
- **FR-007**: Upload manual (editor+): PDF ≤ 5 MiB, tipo escolhido, validade
  informada. O arquivo é gravado na subpasta do tipo no OneDrive com nome
  padronizado da tabela acima (`dd.MM.yy` da validade informada) e a linha é
  criada na mesma requisição com `validUntilSource = 'manual'`. Sem OneDrive
  conectado, o upload é recusado com mensagem clara — não existe segundo
  depósito de arquivo. Se o upload substitui um vigente anterior do mesmo
  tipo com `validUntil` inferior, dispara o mesmo aviso de renovação de
  FR-011 e o ciclo de arquivo de FR-016 **na mesma requisição** (não espera
  a ingestão horária). Falha de WhatsApp ou de arquivo não reverte o upload
  já gravado; fica no log saneado.
- **FR-008**: Editar validade, assinatura e (em cartas) fabricante (editor+)
  via `PATCH /api/documentos/{id}` (`validUntil`, `emitidoEm` e/ou
  `manufacturer`). A edição ocorre no **popup de gestão** (lápis discreto
  ao lado do campo), não na linha da tabela. Validade manual grava
  `validUntilSource = 'manual'`; a ingestão não sobrescreve validade
  manual. `manufacturer` só é aceite em documentos `category = carta`.

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
- **FR-011**: Quando a ingestão **ou o upload manual (FR-007)** encontra um
  documento cujo `validUntil` supera o vigente anterior do mesmo tipo, envia
  o PDF uma única vez (`renewalNotifiedAt`): (1) por e-mail conforme FR-046
  (anexo + tabela resumo); (2) por WhatsApp ao grupo de Documentos (quando o
  canal FR-012 estiver ligado), com legenda "renovada — válida até dd/MM/yyyy".
  Sem vigente anterior (primeira carga) o WhatsApp de renovação não dispara
  (backfill não é evento); o e-mail de atualização do upload ainda segue
  FR-046. Falha de e-mail ou de WhatsApp não impede a outra via; o
  upload/ingestão já gravado não reverte.
- **FR-046**: Sempre que um PDF novo é gravado por **upload manual (FR-007)**
  — e também na renovação detectada pela ingestão (FR-011) — o sistema envia
  e-mail de `adm@qlmed.com.br` (`SMTP_USER`) para Marcelo, Daniele, Flávio e
  José Roberto (`DOCUMENTOS_RENEWAL_EMAIL_RECIPIENTS`) com: (a) o PDF
  atualizado em anexo; (b) no corpo, uma **tabela resumo** de todos os
  documentos vigentes da QLMED (categoria, documento, arquivo, validade,
  status), em HTML e texto. Falha de SMTP não reverte o upload/ingestão.
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
  `validUntil` posterior) é **movida** para a pasta `Vencidas` da raiz da
  família no OneDrive (ex.: `2 - CERTIDÕES`, `1 - AUTORIZAÇÃO RELACIONADO A
  SAUDE`, `7 - CARTA COMERCIALIZAÇÃO`). Sem substituto, permanece na pasta de
  origem. Nada é apagado. Documento com `validUntil` nulo não é arquivado;
  documento com `validUntilSource = 'manual'` sem substituto também não. O
  item movido some da pasta de origem na varredura seguinte e recebe
  `removedAt` pelo caminho já existente, deixando de ser vigente. Se a pasta
  `Vencidas` não existir **sob a raiz da família** (raiz essa já existente),
  o sistema **cria** `Vencidas` nessa raiz e arquiva. Falha ao arquivar um
  item/família **não aborta** os demais — cada movimento é independente.
  Famílias fechadas (certidão, sanitária) arquivam por `kind`; a família
  aberta (carta) arquiva por fabricante extraído do nome. Tipo com
  `expira: false` (AFE) nunca é arquivado por vencimento.

### Famílias (L10)

- **FR-018**: A página `/cadastro/documentos` tem cards `Section` na
  mesma rota, todos **recolhidos** ao entrar (`defaultOpen: false` em cada
  família da tabela). A coluna `CompanyDocument.category`
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
  (fabricante do PDF quando o nome é genérico; senão do nome do ficheiro),
  pasta `1 - DOCUMENTOS/1 - QL MED/7 - CARTA COMERCIALIZAÇÃO`. Colunas:
  Fabricante, **Assinatura** (`emitidoEm`), Válida até, Dias restantes.
  Ordenação por dias restantes, sem data no fim. Cartas com
  `daysRemaining < 0` ficam num separador colapsável **Cartas vencidas**
  (recolhido por omissão); as demais na tabela principal do card. A ingestão
  **lê o PDF** (FR-045) e grava `validUntilSource='pdf'` quando encontra
  validade; a data no nome da carta é assinatura (não validade). Sem data →
  "Sem data" e **não alerta**. Lápis continua a gravar `manual`. Não se
  inventa data. A pasta `Vencidas` (criada se faltar sob a raiz da família)
  serve para arquivo.
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
  `1 - DOCUMENTOS/1 - QL MED/4 - BALANÇOS`, scan `yearFolders`. A ingestão
  enumera cada subpasta `BALANÇO YYYY` e grava **os PDFs dentro** (`kind:
  balanco_anual`, `folderName` = nome da pasta, `validUntil` nulo, `expira:
  false`). Subpasta que não casa é ignorada. Ficheiro solto `BALANÇO
  YYYY.zip` (ou `.pdf`) no raiz só entra se o ano ainda não tem pasta. Ruído
  (`ECF`, `Faturamento`, `.xls`) é ignorado. A listagem devolve `balancos`
  como grupos `{ year, folderWebUrl, documents[] }` (anos DESC). Card
  **Balanços** recolhido; cada ano é um separador colapsável (recolhido) que
  abre a lista de documentos com as mesmas ações do Contrato social (Ver,
  Imprimir, Baixar, Compartilhar, WhatsApp, popup de gestão; "não vence").
  Sem upload, sem lápis de validade. `folderWebUrl` (quando conhecido) abre a
  pasta do ano no OneDrive a partir do cabeçalho do ano.

- **FR-027**: `CompanyDocument.webUrl` (nullable) é persistido na ingestão
  de todas as famílias. No balanço, o `webUrl` do PDF é o do ficheiro; o
  `folderWebUrl` do grupo (URL da pasta do ano, quando a ingestão a viu) abre
  a pasta no OneDrive a partir do cabeçalho do ano.

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

- **FR-030**: Se o nome do ficheiro não tem data extraível e o tipo
  `kindStoresFilenameDate`, a ingestão baixa o PDF e aplica
  `readValidityFromPdf`. Acerto grava `validUntilSource='pdf'`. Data no
  nome continua a ganhar (`filename`) e **não** dispara download. Falha
  de leitura deixa `validUntil` nulo e **não** aborta o ciclo. Tipos com
  `filenameDate: false` (AFE) não leem o PDF.

### Tela integrada (L12)

- **FR-031**: A linha inteira (rato, Enter e Espaço; `role="button"` +
  `tabIndex={0}`) abre `DocumentoDetalheModal`, o painel de gestão. Clique em
  acção, no kebab ou num link da linha **não** abre o modal (`stopPropagation`
  nos controlos). Família `balanco`: a linha do documento comporta-se como
  societário (popup de gestão; sem modal de atualização). O cabeçalho do ano
  só expande/recolhe (e, se houver `folderWebUrl`, o link abre a pasta). O
  `DocumentoUpdateModal` abre só pelo botão **Atualizar arquivo** dentro do
  popup de gestão (família `certidao`, editor+).

- **FR-032**: O modal de atualização segue quatro etapas: anexar (arrastar ou
  clicar; só `.pdf`, ≤ 5 MB, recusa no cliente); ler (`POST /api/documentos/analisar`,
  que chama `readValidityFromPdf` no servidor e **não grava**); confirmar (data
  pré-preenchida com o que foi lido, rótulo "corrigir se estiver errada"; se
  `confidence: 'nenhuma'`, campo vazio e obrigatório — não é erro); enviar
  (`POST /api/documentos/upload`). Sem duplo envio. A rota `analisar` tem a
  mesma ACL de escrita que `upload`; parser sem texto → 200 `confidence: 'nenhuma'`.

- **FR-033**: Acções de linha via `RowActionsBase`: inline `receipt_long`
  "Ver documento" e `print` "Imprimir" (`hideOnMobile`); menu Compartilhar
  (`share`), Baixar (`download`), Atualizar arquivo (`upload_file`). A
  tabela **não** tem lápis de edição — datas e fabricante editam-se no
  popup de gestão (FR-039). Balanço (documento PDF): mesmas ações do
  societário (Ver/Imprimir/Baixar/Compartilhar/WhatsApp), sem Atualizar
  arquivo e sem edição de validade (`expira: false`). Cabeçalho do ano:
  `folder_open` opcional quando há `folderWebUrl`.

- **FR-034**: "Compartilhar" abre `DocumentoShareModal`: caixas da allowlist
  `DOCUMENTOS_SHARE_RECIPIENTS` (rótulo) **e** um campo para escrever e-mail
  (FR-042), observação opcional, envio a
  `POST /api/documentos/{id}/compartilhar`. Zero destinatários desativa
  o botão. Não é `mailto:`. Sucesso: toast com a quantidade; falha: mensagem da
  rota.

- **FR-035**: Cada tipo que `expira` tem `automacao` no config: `'automatica'`
  só `crf_fgts` (comprovado); `'assistida'` `cnd_municipal_mobiliario` e
  `cnd_municipal_gerais` (SIAT pela inscrição municipal); `'manual'` o resto
  que vence, incluindo o não testado. `expira: false` não recebe tag.

- **FR-036**: Na família societário, ficheiro cujo nome contém `contrato`
  e não contém tokens de constituição/alteração classifica
  `contrato_social_consolidado` (ex.: `CONTRATO SOCIAL.pdf`). ATA e
  demais nomes sem `contrato` continuam `outro`. Linha já persistida
  como `outro` com esse nome **aparece** no card de consolidado até a
  próxima ingestão gravar o kind novo.

### Gestão do documento (L13)

- **FR-037**: Todos os cards da página nascem recolhidos (`defaultOpen: false`
  na tabela de famílias; o campo permanece, não vira literal no JSX).
- **FR-038**: Células da tabela usam `px-3 py-2 sm:py-1.5`. Os botões de
  acção mantêm `min-h-11 min-w-11` no telemóvel. O link de emissão da linha
  (FR-017) permanece.
- **FR-039**: O popup de gestão mostra, nesta ordem: tipo (ou **Fabricante**
  nas cartas) e nome do ficheiro; **Emitido em** / **Assinatura** nas cartas
  (`CompanyDocument.emitidoEm`, ou "não informado" — nunca `lastModifiedAt`);
  **Vence em** (ou "não vence" se `expira: false`); **Dias restantes** com o
  mesmo destaque `<= 7` da tabela; **O que é este documento** (`descricao`
  do tipo); **Quem emite / onde renovar** (`orgao` + `emissaoUrl` quando
  existir) — este bloco aparece **sempre**, inclusive nos tipos que não
  vencem; acções Ver, Baixar, Compartilhar, WhatsApp, Atualizar arquivo.
  Com `canWrite`, cada campo editável (datas quando `expira !== false`;
  fabricante só em cartas) tem um **lápis discreto** (`text-[12px]`) que
  abre edição inline no próprio popup e persiste via PATCH (FR-008).
- **FR-040**: `emitidoEm DateTime? @db.Date` é extraído do PDF pela mesma
  máquina de validade: início da faixa `Validade: X a Y`; rótulos `emitida em`,
  `emitido em`, `data de emissão`, `emissão:`. Sem match → `null`. Guarda de
  plausibilidade idêntico ao da validade. Emissão posterior à validade é
  descartada. A ingestão grava quando lê o PDF; documentos já persistidos
  ficam `null` até a próxima leitura.

### Backfill de emissão (L14)

- **FR-041**: Editor+ dispara `POST /api/documentos/backfill-emissao` em lotes
  explícitos (omissão 25, teto 100) para preencher `emitidoEm` nulo a partir
  de `readValidityFromPdf`. Não inventa emissão a partir de `lastModifiedAt`.
  Não toca em `validUntil`, `validUntilSource`, `removedAt`,
  `alertedThresholds` nem `renewalNotifiedAt`. Não cria nem apaga linhas. Não
  processa a família `balanco`. Ficheiro acima de `DOCUMENTOS_UPLOAD_MAX_BYTES`
  (pelo `fileSize` gravado ou pelo `Content-Length`) é ignorado sem
  materializar o corpo. Downloads são sequenciais. Lock advisory próprio
  (`documentos-backfill-emissao:<companyId>`), distinto da ingestão; lock
  ocupado devolve resultado vazio com `ocupado: true`. A tela tem o botão
  **Preencher emissões** visível só quando falta emissão; cada clique corre
  um lote e mostra o resumo — não há laço automático nem timer.

### Compartilhar e cartas por e-mail (L15)

- **FR-042**: O diálogo de compartilhar aceita e-mail escrito à mão (um ou
  mais, separados por vírgula), além das caixas da allowlist. A rota valida
  formato (`local@domínio`), recusa inválido com 400, aceita no máximo 10
  destinatários por pedido, e envia o PDF em anexo como já fazia. Continua a
  exigir editor+ e a página Documentos — não é relay anónimo.
- **FR-043**: Existe um botão **WhatsApp** próprio (menu da linha e popup de
  gestão), distinto de "Compartilhar". Abre `DocumentoWhatsAppModal` com a
  allowlist operacional (Marcelo, Daniele, Flavio, José Roberto — números
  pré-cadastrados), checkboxes multi-seleção, campo **Outro número** (um ou
  mais, Brasil) e observação opcional. Envio a
  `POST /api/documentos/{id}/compartilhar-whatsapp` com `phones[]` (máx. 10)
  via `sendWhatsAppDocument` por destinatário. Número inválido → 400;
  Evolution desligada → 503 com mensagem clara; sem fallback para o grupo
  fiscal. Legenda contém tipo e validade, nunca o PDF em log.
- **FR-044**: Editor+ dispara `POST /api/documentos/cartas-email` (e a
  ingestão de produção, quando a porta é a real) varre as caixas
  `joseroberto@qlmed.com.br`, `marcelo@qlmed.com.br`, `flavio@qlmed.com.br`
  e `daniele@qlmed.com.br` em busca de anexos PDF de carta de comercialização
  (assunto, nome do anexo ou texto com carta + comercialização/autorização/
  distribuição/representação). O **nome ou o texto do PDF** têm de carregar
  carta+tema — assunto sozinho não basta. Alvará, licença sanitária,
  certificado de regularidade, credenciamento e DANFE/NF-e são ignorados.
  Até 40 páginas Graph por caixa. O texto do PDF é **sempre** lido antes de
  aceitar o anexo (com OCR se a camada de texto for escassa). A ingestão
  OneDrive da pasta carta **salta** esses ficheiros (não entram em `seenIds`,
  logo `removedAt` limpa linhas já importadas por engano). PDF novo é gravado
  na pasta OneDrive da família carta (nome saneado; `(2)` / `assinada` colidem
  com o original); ficheiro já existente (mesmo nome, sem acento) é saltado.
  Falha de uma caixa não aborta as outras.
- **FR-045**: A leitura de PDF das cartas reconhece validade em formas
  distintas: rótulos (`validade`, `válida até`, `válido até o dia`,
  `validade desta carta`, `vigente até`, `autorizada até`, `com validade
  até`); faixa `de X a Y`; e prazo relativo (`válida por N meses`, `válidos
  por período de N meses`, `validade de N meses`, `Validade: Um ano`,
  `credencial … 1 ano`). PDF escaneado (pouco texto via pdf.js) usa fallback
  OCR (`pdftotext`/`tesseract`). Texto OCR com dígitos/meses partidos
  (`202 6`, `2 0 2 1`, `me ses`, `Ju lho`, `feverairo`) é normalizado antes
  do match. Emissão pelos rótulos existentes, `Data:`, rodapé após
  Atenciosamente e cabeçalho `Cidade, DD de mês de AAAA` (inclui Guarulhos).
  Prazo relativo só grava validade se houver emissão/assinatura. Fabricante
  persistido em `manufacturer` (PDF ou nome). Prazo indeterminado deixa
  validade nula. Não se inventa data. Nome do ficheiro também reconhece
  compacto `26fev26` / `27ago26` como assinatura, não como validade.
  Cartas antigas com validade no passado ficam vencidas (`daysRemaining < 0`).

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
- **AC-008** (FR-011 + FR-046): ingestão que substitui vigente 12.10.26 por
  12.12.26 envia uma renovação (e-mail com anexo + tabela resumo para
  Marcelo/Daniele/Flávio/José Roberto + WhatsApp se FR-012 ligado);
  reexecução não reenvia; primeira carga não envia renovação WhatsApp.
- **AC-009** (FR-007 + FR-046): upload de 6 MiB → 413/400 com mensagem;
  upload válido cria item no OneDrive (porta mockada) e linha com
  `validUntilSource='manual'`. Todo upload válido dispara e-mail FR-046
  (anexo + tabela resumo). Upload que substitui vigente anterior com
  validade maior dispara também `notifyRenewals` (WhatsApp) e o arquivo
  FR-016 na mesma requisição (teste `documentos-upload-renewal.test.ts`).
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
  `removedAt` e não é vigente. Pasta `Vencidas` ausente sob a raiz da
  família → o sistema cria `Vencidas` e arquiva. Falha num item/família não
  impede arquivar os demais; a ingestão não falha.
- **AC-013** (FR-018/023): a listagem devolve `certidoes` (7), `sanitaria`
  (6 tipos fechados) e `cartas` (N ficheiros). A página tem as `Section`
  com esses títulos; todos os cards nascem recolhidos.
- **AC-014** (FR-019): `kindExpires('afe_anvisa') === false`; ingestão de
  `AFE - EMITIDO EM 06.01.2026.pdf` grava `validUntil = null`; o tick de
  alerta com AFE a 30 dias da data do nome envia 0. Controlo negativo: pôr
  `expira: true` na AFE faz o teste "AFE nunca alerta" falhar.
- **AC-015** (FR-021): `thresholdDue(90, [], sanitaria) === 90`;
  `thresholdDue(60, [90], sanitaria) === 60`; os limiares da certidão não
  disparam em 90 dias. Controlo negativo: copiar os limiares da certidão
  para a sanitária faz o teste 90/60 falhar.
- **AC-016** (FR-020): carta `Carta Comercialização TECHIMPORT.pdf` sem
  validade no PDF fica sem `validUntil` e o tick não envia. Controlo
  negativo: gravar validade inventada faz o teste "carta sem data não alerta"
  falhar. Validade lida do PDF grava `validUntilSource='pdf'` (AC-035).
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
- **AC-020** (FR-026): ingestão de pastas 2024/2025/2026 com PDFs dentro +
  zip 2026 duplicado (ignorado) + zip 2013 sem pasta + ruído → PDFs das
  pastas + o zip 2013; pastas sem PDF não criam linha de documento. Controlo
  negativo: gravar só a pasta (sem `listPdfs` do ano) faz o teste "PDFs
  dentro de pastas de ano" falhar.
- **AC-021** (FR-026/027): o card Balanços agrupa por ano (colapsável,
  recolhido); cada documento tem Ver e "não vence" como societário; o
  cabeçalho do ano pode ter link `folderWebUrl` "Abrir pasta no OneDrive".
- **AC-022** (FR-029): após ingestão com Contrato Social presente, um ciclo
  em que `listPdfs` da pasta societário lança `pasta não encontrada` devolve
  `skippedFamilies=['societario']`, mantém `removedAt` nulo no contrato e
  nas certidões, e atualiza `lastSuccessAt`. Controlo negativo: porta sem
  `listChildren` continua a abortar.
- **AC-023** (FR-030): fixture `…MOBILIARIO 05.04.pdf` sem ano no nome,
  com `readValidityFromPdf` devolvendo `2026-12-01`, persiste essa data
  com `validUntilSource='pdf'` e **não** chama `downloadPdf` nos ficheiros
  cuja data já saiu do nome.
- **AC-024** (FR-031): clicar em Ver não abre o modal de gestão nem o de
  atualização; clicar na linha da certidão abre o de gestão. "Atualizar
  arquivo" dentro do popup abre o de atualização. Controlo negativo: deixar
  o clique do botão Ver propagar para a linha faz o teste falhar.
- **AC-025** (FR-032): validade lida (`confidence: 'alta'`) entra
  pré-preenchida no campo; `nenhuma` deixa o campo vazio e não bloqueia.
  Controlo negativo: ignorar o valor lido faz o teste "validade lida entra
  pré-preenchida" falhar.
- **AC-026** (FR-034): enviar com zero destinatários é impossível (botão
  desativado). Controlo negativo: permitir enviar vazio faz o teste falhar.
- **AC-027** (FR-035): só `crf_fgts` é `automacao: 'automatica'`. Controlo
  negativo: marcar `cnd_federal` como automática faz o teste das tags falhar
  nomeando que só o FGTS é automático.
- **AC-028** (FR-036): `CONTRATO SOCIAL.pdf` na pasta societário classifica
  `contrato_social_consolidado`; `ATA ASSEMBLEIA.pdf` permanece `outro`.
  Listagem com kind persistido `outro` e nome `CONTRATO SOCIAL.pdf`
  preenche a linha de consolidado; a ATA não aparece.
- **AC-029** (FR-037): `DOCUMENTOS_FAMILIES.every((f) => f.defaultOpen === false)`.
  Controlo negativo: `defaultOpen: true` numa família faz o teste "todos os
  cards recolhidos" falhar.
- **AC-030** (FR-039/040): `emitidoEm` null no popup mostra "não informado";
  `lastModifiedAt` não é consultado. Controlo negativo: usar `lastModifiedAt`
  como fallback faz o teste falhar. Faixa `31/08/2026 a 29/09/2026` devolve
  emissão 31/08 e validade 29/09; devolver o fim nas duas faz o teste da
  emissão falhar. O bloco "quem emite" aparece com `expira: false`; escondê-lo
  nesse caso faz o teste falhar.
- **AC-031** (FR-041): um lote preenche só `emitidoEm` lido do PDF; PDF sem
  emissão deixa o campo nulo mesmo com `lastModifiedAt` presente; ficheiro
  grande não é materializado; downloads não correm em paralelo. Controlo
  negativo: remover o teto, gravar `lastModifiedAt`, gravar `validUntil` ou
  trocar o laço por `Promise.all` faz o teste respectivo falhar.
- **AC-032** (FR-042): e-mail `compras@hospital.com.br` é aceite e entra em
  `to`; `nao-e-email` e lista vazia → 400 e `sendMail` não corre. Mais de 10
  destinatários → 400.
- **AC-033** (FR-043): allowlist `Marcelo` resolve para o JID do número
  pré-cadastrado; `67999999999` (livre) normaliza para `5567999999999`;
  `abc` → 400 e Evolution não é chamada; mais de 10 → 400. Modal lista os
  rótulos pré-cadastrados e o campo "Outro número". Botão "WhatsApp" existe
  no popup de gestão e é distinto de "Compartilhar".
- **AC-034** (FR-044): anexo `Carta Comercialização TECHIMPORT.pdf` é
  importado; `DANFE 123.pdf`, `NF DOC MED 81.472.pdf` e carta cujo nome já
  está na pasta são saltados; texto DANFE com assunto de carta também é
  rejeitado. Ingestão OneDrive salta NF e marca `removedAt` em linha antiga.
- **AC-035** (FR-045): `válida por 12 meses a contar da emissão` +
  emissão → validade; `válidos por período de 12 meses` + `01 de abril 2022`
  (sem segundo «de») → emissão `2022-04-01` e validade `2023-04-01`;
  compacto `26fev26` no nome → `2026-02-26`.
  `emitida em 01/03/2026` → validade `2027-03-01`; `vigente até 31/12/2026`
  → essa data; prazo indeterminado → `validUntil` nulo.

- **AC-036** (FR-046): upload válido (mesmo sem renovação) envia e-mail de
  `adm@qlmed.com.br` com o PDF em anexo e HTML contendo tabela com colunas
  Categoria/Documento/Arquivo/Validade/Status cobrindo os documentos
  vigentes; teste `documentos-update-email.test.ts` +
  `documentos-upload-renewal.test.ts`.

## Non-functional

- Página lista do banco, nunca do OneDrive em tempo de requisição (p95 < 500 ms).
- Ingestão completa das 5 pastas < 30 s; abortada por lock advisory se já
  houver uma em curso (`documentosIngestLockKey`). O backfill de emissão usa
  chave distinta e nunca corre downloads em paralelo.
- UI passa `npm run ui:check` (tokens, dialogs, empty state via `EmptyState`).

## Out of scope (explícito)

- **Emissão automática nos órgãos** (Receita, Caixa, TST, SEFAZ-MS, Prefeitura):
  fica para spike `S1` em `PLAN.md`; captcha e login gov.br tornam a
  viabilidade incerta por órgão. Este spec entrega "atualização automática" no
  sentido: o que a contabilidade coloca no OneDrive aparece sozinho, com aviso.
- Outras categorias ainda não modeladas (CRT CREA, falência, protestos):
  entram como nova entrada em `DOCUMENTOS_FAMILIES`, não nesta folha.
- Parser de validade no conteúdo do PDF das certidões (entregue em P1 via
  ingestão FR-030; L12 consome via `POST /api/documentos/analisar`). Cartas:
  FR-045.
- E-mail e push para os avisos automáticos de vencimento.

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
