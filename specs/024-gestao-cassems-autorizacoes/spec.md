---
id: SPEC-024
status: implemented
owner: QLMED
related_decisions:
  - ADR-0001
  - ADR-0007
  - ADR-0008
affected_modules:
  - navigation
  - gestao-cassems
  - onedrive
---

# Feature Specification: Autorizações CASSEMS em Gestão

**Feature Branch**: `feat/gestao-cassems-autorizacoes`

**Created**: 2026-08-30

**Status**: Implemented

**Input**: Clone operacional da SPEC-023 (IMPCG) para o cliente
CASSEMS. Grupo **Gestão**, página **CASSEMS**. O ofício chega por
e-mail (`oficio.cconecte@cassems.com.br`) à caixa
`joseroberto@qlmed.com.br`. O PDF modelo já está na pasta de
autorizações CASSEMS do arquivo da empresa. A lista lê o banco; o
arquivo vem do OneDrive.

## Problem

As autorizações OPME da CASSEMS não têm tela no QLMED. O operador
não vê, num só lugar, o ofício, o paciente e o PDF. O mesmo envio
não pode virar duas linhas. O arquivo precisa ficar na pasta já
usada pelo faturamento (irmã da IMPCG), descoberta no OneDrive —
não inventada.

## Roles and ownership

- **Operador (viewer) com a página Gestão/CASSEMS**: lista e abre o
  documento. Não dispara coleta.
- **Editor ou admin com a página**: além de ver, pode pedir atualização
  imediata da coleta.
- **Admin**: vê a página mesmo sem ela na lista explícita (bypass
  atual do menu).
- **Coleta automática (sistema)**: lê a caixa da empresa, grava o
  arquivo na pasta CASSEMS e atualiza o cadastro. Isolamento da
  empresa única no servidor. Contexto de empresa NÃO vem do pedido
  HTTP.
- **Quem não tem a página**: não vê o item no menu e a API recusa
  (403). Esconder no menu não é autorização.

## User scenarios and testing

### User Story 1 — Ver autorizações na página CASSEMS (Priority: P1)

Como operador, em **Gestão → CASSEMS** eu vejo uma tabela com data
do ofício, número da autorização, paciente, prestador/médico,
hospital, total e o arquivo. Abro o PDF no popup do site (mesmo
comportamento das notas e da IMPCG).

**Why this priority**: é a tela pedida; sem ela o restante não se
demonstra.

**Independent Test**: Com autorizações já gravadas, um usuário com a
página vê as colunas e abre o popup; um usuário sem a página recebe
recusa na API.

**Acceptance Scenarios**:

1. **AC-001** — Given um operador autenticado com a página
   `/gestao/cassems`, when abre Gestão → CASSEMS, then MUST ver a
   lista ordenada por data do ofício decrescente e, em empate, pelo
   número da autorização. No card compacto/celular MUST aparecer
   paciente, local (hospital) e médico; MUST NOT mostrar o valor.
2. **AC-002** — Given uma autorização com arquivo gravado, when o
   operador abre a linha ou o ícone do arquivo, then MUST abrir o
   popup com título `Autorização {número} — {paciente}`, a **data
   do ofício** no cabeçalho (mesmo se vazia, como `—`), os demais
   dados, a tabela de itens e o PDF no viewer do site **sem o
   painel de miniaturas à esquerda**; Esc e o voltar do aparelho
   fecham.
3. **AC-003** — Given um usuário autenticado sem a página e sem ser
   admin, when chama a API da lista ou do arquivo, then MUST receber
   403 e MUST NOT ver o item no menu.
4. **AC-004** — Given nenhuma autorização, when o operador abre a
   página, then MUST ver o estado vazio “Nenhuma autorização CASSEMS.”
   sem linhas inventadas.
5. **AC-016** — Given o popup de uma autorização, when o editor
   clica no lápis sutil de um campo do cabeçalho, then MAY
   corrigir o valor lido. After save MUST marcar **editado** e
   MUST NOT deixar a coleta sobrescrever esse campo. Viewer MUST
   receber 403.

### User Story 2 — E-mail vira arquivo e linha (Priority: P1)

Como sistema, quando Serviços OPME da CASSEMS
(`oficio.cconecte@cassems.com.br`) envia PDF para
`joseroberto@qlmed.com.br`, eu gravo o anexo na pasta CASSEMS do
arquivo da empresa, leio o documento e atualizo uma única
autorização. O mesmo Message-ID não duplica. O mesmo número de
autorização não duplica.

**Why this priority**: sem coleta, a página depende só da pasta; sem
dedup, o operador vê o dobro.

**Independent Test**: Um envio com autorização 2479325231 produz
uma linha, um arquivo na pasta CASSEMS e totais em centavos iguais
aos do documento (476.000).

**Acceptance Scenarios**:

1. **AC-005** — Given um e-mail do remetente CASSEMS com PDF de
   ofício OPME, when a coleta roda, then MUST existir exatamente
   uma autorização e o PDF MUST estar na pasta descoberta
   `1 - DOCUMENTOS/0 - AUTORIZACOES/CASSEMS` com nome
   `CASSEMS {número} {PACIENTE}.pdf` (arquivos já na pasta
   mantêm o nome existente).
2. **AC-006** — Given o mesmo identificador de mensagem processado
   de novo, when a coleta roda, then MUST NOT criar segunda
   autorização.
3. **AC-007** — Given duas mensagens com o mesmo número de
   autorização, when a coleta processa as duas, then MUST
   permanecer uma autorização; se a leitura nova for mais completa
   que a antiga, MUST atualizar a linha (completa > parcial > falha).
4. **AC-008** — Given o ofício modelo (autorização 2479325231),
   when a coleta lê o arquivo, then MUST extrair paciente, matrícula,
   prestador solicitante, CRM se houver, procedimento, local de
   execução, itens (descrição, ANVISA, quantidade, unitário, total
   da linha, marca/ref se houver) e valor total com desconto, com
   dinheiro em centavos.
5. **AC-009** — Given o paciente só no assunto ou só no documento,
   when a coleta lê, then o nome do paciente MUST ser o do
   documento se existir, senão o do assunto.

### User Story 3 — Passado e atualização (Priority: P2)

Como editor, a primeira coleta varre a pasta (o PDF modelo já está
lá) e tenta a caixa. Depois, a coleta periódica pega o que for
novo. Posso pedir “Atualizar agora”. Viewer não dispara coleta.

**Why this priority**: o pedido inclui “desde o dia 1” via pasta;
a tela precisa mostrar a última coleta.

**Independent Test**: Pasta com o PDF modelo vira 1 linha. Viewer
não inicia coleta; editor inicia.

**Acceptance Scenarios**:

1. **AC-010** — Given o PDF modelo já na pasta CASSEMS, when a
   primeira coleta conclui, then MUST existir exatamente uma linha
   para a autorização 2479325231, sem depender de Graph Mail.
2. **AC-011** — Given um editor ou admin com a página, when aciona
   “Atualizar agora”, then MUST rodar a mesma coleta periódica e o
   cabeçalho MUST mostrar o horário da última coleta no relógio do
   servidor.
3. **AC-012** — Given um viewer com a página, when abre CASSEMS,
   then MUST NOT ver ação de disparar coleta.

### User Story 4 — Pasta CASSEMS sem Graph Mail (Priority: P1)

Como sistema, se a caixa Exchange estiver indisponível
(dehydrated / 403) mas o PDF já estiver na pasta CASSEMS do
arquivo da empresa, eu leio o arquivo que já está lá, extraio a
autorização e crio a linha. Não reenvio o PDF. A lista continua
lendo só o Postgres — o arquivo sozinho não cria linha até a
coleta.

**Why this priority**: o ofício modelo já está na pasta; sem
varredura a tela fica vazia no primeiro dia.

**Independent Test**: mock da pasta com o PDF modelo cria uma
linha; segunda varredura não duplica; Graph Mail 403 ainda
importa o arquivo da pasta.

**Acceptance Scenarios**:

1. **AC-013** — Given um PDF já na pasta
   `1 - DOCUMENTOS/0 - AUTORIZACOES/CASSEMS` cujo número de
   autorização ainda não existe no cadastro, when a coleta roda
   (worker ou “Atualizar agora”), then MUST criar exatamente uma
   autorização com o `oneDriveItemId` já conhecido e MUST NOT
   reenviar o arquivo (FAIL-002 não se aplica a arquivo já na pasta).
2. **AC-014** — Given a autorização 2479325231 já gravada, when a
   varredura da pasta roda de novo, then MUST NOT criar segunda
   linha. Graph Mail 403 MUST NOT impedir a varredura da pasta.

### Edge cases

- A caixa Exchange responde 403 (mailbox dehydrated / RBAC):
  registra FAIL-001; MUST ainda varrer a pasta.
- Leitura do documento falha: o arquivo ainda MUST ir para a pasta
  CASSEMS (origem e-mail); a linha fica com estado de leitura
  falha; paciente pelo assunto se der; o PDF continua abrível.
- Soma dos itens diferente do total com desconto: persiste os
  dois; estado parcial; não inventa valor.
- Gravação na pasta da empresa falha: MUST NOT confirmar a
  autorização; tenta de novo. Sem arquivo na pasta, não há linha
  concluída.
- PDF já na pasta: MUST NOT reenviar; usa o itemId existente.
  Sem número de autorização no texto nem no nome do arquivo
  (mínimo 6 dígitos de autorização), MUST NOT criar linha nem
  inventar itens. Carimbo `133128021` no nome do modelo MUST NOT
  ser tratado como número da autorização.

## Requirements

### Functional requirements

- **FR-001**: O menu MUST ter o grupo **Gestão** e a página
  **CASSEMS** em `/gestao/cassems`.
- **FR-002**: Acesso à página e à API MUST exigir a página na
  lista do usuário, salvo admin. Autorização no servidor. A API
  `/api/gestao/cassems` MUST exigir a página CASSEMS, não a IMPCG.
- **FR-003**: A coleta MUST ler só a caixa
  `joseroberto@qlmed.com.br`, filtrando remetente
  `oficio.cconecte@cassems.com.br` com anexo de ofício.
- **FR-004**: A coleta MUST gravar o PDF na pasta de autorizações
  CASSEMS do arquivo da empresa antes de considerar a autorização
  concluída (origem e-mail). Pasta descoberta:
  `1 - DOCUMENTOS/0 - AUTORIZACOES/CASSEMS`.
- **FR-005**: Deduplicação MUST usar o identificador da mensagem
  e o número da autorização impresso no ofício, por empresa.
- **FR-006**: Quando o documento for legível, a leitura MUST obter
  data do ofício, número da autorização, paciente, matrícula se
  houver, prestador solicitante, CRM se houver, procedimento,
  local de execução, itens aprovados e valor total com desconto.
  Dinheiro MUST ser inteiro em centavos (ou decimal de dinheiro),
  nunca fração binária. Documento ilegível segue FAIL-003.
- **FR-007**: A lista MUST mostrar data, número, paciente (com o
  hospital embaixo, contraste sutil), prestador, total em reais e
  ação de arquivo. No card compacto/celular MUST mostrar paciente,
  local e médico e MUST NOT mostrar o valor. Itens e PDF no popup.
- **FR-008**: Estado de leitura parcial ou falha MUST aparecer na
  linha sem impedir abrir o PDF. Parcial MUST mostrar, na lista e
  no cabeçalho do popup, o que faltou (campos vazios ou soma das
  linhas ≠ total), derivado dos dados já persistidos — sem coluna
  nova. Falha MUST dizer que não foi possível ler o documento.
  Ok MUST NOT exibir texto de falta.
- **FR-009**: Viewer MUST NOT disparar coleta. Editor ou admin com
  a página MAY disparar a mesma coleta da rotina.
- **FR-010**: A primeira execução MUST varrer a pasta CASSEMS
  (PDF modelo já presente). Histórico de e-mail é adicional, não
  pré-requisito da primeira linha.
- **FR-011**: A coleta MUST varrer os PDFs da pasta CASSEMS do
  arquivo da empresa mesmo quando a caixa Graph falhar. Arquivo
  já na pasta MUST ser associado pelo itemId, sem reenvio.
  Autorização já cadastrada (exceto `falha` com arquivo novo)
  MUST ser ignorada, salvo campo do cabeçalho ainda não editado
  à mão.
- **FR-012**: Editor ou admin MAY corrigir no popup qualquer
  campo do cabeçalho (lápis sutil). After save MUST marcar
  **editado**. Viewer MUST NOT editar. Coleta MUST NOT
  sobrescrever campo editado.

### Failure cases

- **FAIL-001**: Falha ao ler a caixa — não abortar a varredura da
  pasta; não apagar cadastro existente.
- **FAIL-002**: Falha ao gravar o arquivo na pasta CASSEMS — não
  confirmar autorização nova. Não se aplica quando o PDF já está
  na pasta (backfill por itemId conhecido).
- **FAIL-003**: Falha ao ler o documento — gravar arquivo; linha
  com falha; não inventar itens nem totais.
- **FAIL-004**: Totais inconsistentes no documento — persistir
  parcial, sem “corrigir” o total.

### Non-functional

- Sem senha, token ou e-mail completo em log. Sem payload clínico
  completo em log (itens e valores só em persistência).
- Coleta com tempo limitado por caixa; falha explícita se estourar.
- Evidência: testes de dedup, leitura da autorização 2479325231
  (centavos), ACL 403, “sem arquivo na pasta ⇒ sem autorização
  confirmada”, e folder scan do modelo ⇒ 1 linha.
- Constitui mudança de comportamento, permissão, persistência e
  integração: Spec Kit obrigatório. Migration versionada.

### Out of scope

- Outros clientes além da CASSEMS (IMPCG permanece SPEC-023).
- Editar ou apagar ofício na tela.
- Gerar financeiro, estoque ou NF-e a partir do ofício.
- Consentimento de leitura de e-mail em todo o tenant.
- Download em lote de PDFs.
- Framework genérico compartilhado com IMPCG (espelho de módulos
  `src/lib/cassems/*`). Helper compartilhado só se a duplicação
  for mecânica (lista Graph mail, scan de pasta).

### Test strategy

- Leitura: fixture da autorização 2479325231 (paciente DOUGLAS
  BARBOSA FELIPE, dois itens, total 476.000 centavos).
- Dedup: mesma mensagem → 1 linha; mesmo número → 1 linha.
- ACL: viewer sem página → 403.
- Pasta: falha ao gravar arquivo (origem e-mail) → nenhuma
  autorização nova confirmada. PDF já na pasta → uma linha sem
  reenvio; segunda varredura não duplica; Graph 403 ainda importa
  o arquivo da pasta.
- Validação do repositório: `docs:validate`, verificação de tipos,
  lint e testes automatizados.

## Key entities

- **Autorização CASSEMS**: um ofício OPME (número de autorização
  único por empresa), cabeçalho clínico/comercial, total com
  desconto, estado da leitura, referência ao arquivo na pasta
  CASSEMS, identificadores das mensagens já consumidas.
- **Item aprovado**: linha de material (ANVISA, descrição, marca,
  referência, quantidade, unitário, total da linha) pertencente a
  uma autorização.
- **Mensagem de origem**: e-mail do remetente CASSEMS na caixa
  monitorada, usado só para coletar e deduplicar.

## Success Criteria

- **SC-001**: Um operador com permissão encontra a autorização
  2479325231 na lista e abre o PDF no popup em menos de 30
  segundos após entrar na página.
- **SC-002**: 100% dos envios de teste com o mesmo Message-ID ou
  o mesmo número de autorização geram uma única linha.
- **SC-003**: 100% das autorizações confirmadas na lista têm o
  PDF correspondente na pasta CASSEMS do arquivo da empresa.
- **SC-004**: Na fixture 2479325231, o total exibido é
  R$ 4.760,00 e a soma das duas linhas de item fecha esse valor.
- **SC-005**: Usuário sem a página não lista nem abre arquivo
  (recusa do servidor).

## Assumptions

- A caixa `joseroberto@qlmed.com.br` poderá ser lida pela
  aplicação com recorte RBAC (grupo `QLMED Graph Mail IMPCG`).
  Se o tenant ainda estiver `IsDehydrated`, a coleta de e-mail
  falha de forma explícita (FAIL-001) e a pasta ainda importa.
- A conta de arquivo já conectada ao QLMED
  (`faturamento@qlmed.com.br`) permanece a dona da pasta
  `1 - DOCUMENTOS/0 - AUTORIZACOES/CASSEMS` (irmã da IMPCG,
  confirmada via Graph no drive do faturamento em 2026-08-30).
- O documento típico é “Ofício de materiais OPME” da CASSEMS,
  com número de autorização, paciente, matrícula, procedimentos
  e tabela de materiais (TUSS / ANVISA / valores).
- Data da tabela é a data impressa no ofício (`Data/hora`), não
  a data de chegada do e-mail. A chegada fica só no cadastro
  interno.
- Número canônico da linha é o “Número de autorização” (não o
  “Número do Fornecimento” nem o carimbo do nome do arquivo).
- Papéis viewer / editor / admin e a lista de páginas continuam
  os do produto atual.
