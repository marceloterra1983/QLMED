---
id: SPEC-023
status: implemented
owner: QLMED
related_decisions:
  - ADR-0001
  - ADR-0007
  - ADR-0008
affected_modules:
  - navigation
  - gestao-impcg
  - onedrive
---

# Feature Specification: Autorizações IMPCG em Gestão

**Feature Branch**: `feat/gestao-impcg-autorizacoes`

**Created**: 2026-08-30

**Status**: Implemented

**Input**: Novo grupo **Gestão** no menu, página **IMPCG**. O cliente
Instituto Municipal de Previdência de Campo Grande envia ordem de
fornecimento por e-mail (remetente Compras Impcg). O sistema coleta as
duas caixas da empresa, grava o anexo na pasta de autorizações IMPCG
do arquivo da empresa, lê o documento (inclusive digitalizado) e
mostra data, paciente e arquivo no padrão do painel, com médico,
procedimento, hospital, itens e valores.

## Problem

As autorizações chegam por e-mail para duas pessoas ao mesmo tempo.
Não há tela no QLMED. O operador não vê, num só lugar, o ofício, o
paciente e o PDF. O mesmo envio nas duas caixas não pode virar duas
linhas. O arquivo precisa ficar na pasta já usada pelo faturamento
(`1 - DOCUMENTOS/0 - AUTORIZACOES/IMPCG`).

## Roles and ownership

- **Operador (viewer) com a página Gestão/IMPCG**: lista e abre o
  documento. Não dispara coleta.
- **Editor ou admin com a página**: além de ver, pode pedir atualização
  imediata da coleta e completar na tela só os campos ainda vazios.
- **Admin**: vê a página mesmo sem ela na lista explícita (bypass
  atual do menu).
- **Coleta automática (sistema)**: lê as caixas da empresa, grava o
  arquivo na pasta IMPCG e atualiza o cadastro. Isolamento da empresa
  única no servidor. Contexto de empresa NÃO vem do pedido HTTP.
- **Quem não tem a página**: não vê o item no menu e a API recusa
  (403). Esconder no menu não é autorização.

## User scenarios and testing

### User Story 1 — Ver autorizações na página IMPCG (Priority: P1)

Como operador, em **Gestão → IMPCG** eu vejo uma tabela com data do
ofício, número, paciente, médico, hospital, total e o arquivo. Abro o
PDF no popup do site (mesmo comportamento das notas).

**Why this priority**: é a tela pedida; sem ela o restante não se
demonstra.

**Independent Test**: Com autorizações já gravadas, um usuário com a
página vê as colunas e abre o popup; um usuário sem a página recebe
recusa na API.

**Acceptance Scenarios**:

1. **AC-001** — Given um operador autenticado com a página
   `/gestao/impcg`, when abre Gestão → IMPCG, then MUST ver a lista
   ordenada por data do ofício decrescente e, em empate, pelo número.
   No card compacto/celular MUST aparecer paciente, local (hospital)
   e médico; MUST NOT mostrar o valor.
2. **AC-002** — Given uma autorização com arquivo gravado, when o
   operador abre a linha ou o ícone do arquivo, then MUST abrir o
   popup com título `Ordem {número} — {paciente}`, a **data do
   ofício** no cabeçalho (mesmo se vazia, como `—`), os demais
   dados, a tabela de itens e o PDF no viewer do site **sem o
   painel de miniaturas à esquerda**; Esc e o voltar do aparelho
   fecham.
3. **AC-003** — Given um usuário autenticado sem a página e sem ser
   admin, when chama a API da lista ou do arquivo, then MUST receber
   403 e MUST NOT ver o item no menu.
4. **AC-004** — Given nenhuma autorização, when o operador abre a
   página, then MUST ver o estado vazio “Nenhuma autorização IMPCG.”
   sem linhas inventadas.
5. **AC-016** — Given uma autorização parcial com data vazia, when
   um editor preenche a data no popup, then MUST persistir só esse
   campo, recalcular o estado de leitura e MUST NOT alterar campos
   já lidos. Viewer MUST receber 403.

### User Story 2 — E-mail vira arquivo e linha (Priority: P1)

Como sistema, quando Compras Impcg (`compras.impcg@gmail.com`) envia
PDF para `marcelo@qlmed.com.br` e/ou `flavio@qlmed.com.br`, eu gravo
o anexo na pasta IMPCG do arquivo da empresa, leio o documento e
atualizo uma única autorização. O mesmo e-mail nas duas caixas não
duplica. O mesmo número de ordem não duplica.

**Why this priority**: sem coleta, a página fica vazia; sem dedup, o
operador vê o dobro.

**Independent Test**: Um envio presente nas duas caixas, com ordem
17673, produz uma linha, um arquivo na pasta IMPCG e totais em
centavos iguais aos do documento.

**Acceptance Scenarios**:

1. **AC-005** — Given um e-mail do remetente Compras Impcg com PDF de
   ordem de fornecimento nas duas caixas, when a coleta roda, then
   MUST existir exatamente uma autorização e o PDF MUST estar na
   pasta `1 - DOCUMENTOS/0 - AUTORIZACOES/IMPCG` com nome
   `OFICIO {número} {PACIENTE}.pdf`.
2. **AC-006** — Given o mesmo identificador de mensagem nas duas
   caixas, when a coleta processa as duas, then MUST NOT criar
   segunda autorização.
3. **AC-007** — Given duas mensagens com o mesmo número de ordem,
   when a coleta processa as duas, then MUST permanecer uma
   autorização; se a leitura nova for mais completa que a antiga,
   MUST atualizar a linha (completa > parcial > falha).
4. **AC-008** — Given um documento digitalizado sem texto
   selecionável (como a ordem 17673), when a coleta lê o arquivo,
   then MUST extrair paciente, médico, CRM, procedimento, hospital,
   itens (registro, descrição, marca, referência, quantidade,
   unitário, total da linha) e total geral, com dinheiro em
   centavos. Data MUST ser lida de `DATA:`, da linha
   “Campo Grande…”, de hífen/ponto e de OCR com `O`/`0`.
   Se a data (ou outro campo) continuar vazia, a linha fica
   parcial e o editor MAY completar na tela (AC-016).
5. **AC-009** — Given o paciente só no assunto ou só no documento,
   when a coleta lê, then o nome do paciente MUST ser o do
   documento se existir, senão o do assunto.

### User Story 3 — Passado e atualização (Priority: P2)

Como editor, na primeira coleta o sistema percorre o histórico das
duas caixas. Depois, a coleta periódica pega o que for novo. Posso
pedir “Atualizar agora”. Viewer não dispara coleta.

**Why this priority**: o pedido inclui o passado; a tela precisa
mostrar a última coleta.

**Independent Test**: Histórico com N ofícios distintos vira N
linhas, sem duplicata por caixa. Viewer não inicia coleta; editor
inicia.

**Acceptance Scenarios**:

1. **AC-010** — Given mensagens históricas do remetente nas duas
   caixas, when a primeira coleta conclui, then cada número de ordem
   distinto MUST ter uma linha.
2. **AC-011** — Given um editor ou admin com a página, when aciona
   “Atualizar agora”, then MUST rodar a mesma coleta periódica e o
   cabeçalho MUST mostrar o horário da última coleta no relógio do
   servidor.
3. **AC-012** — Given um viewer com a página, when abre IMPCG, then
   MUST NOT ver ação de disparar coleta.

### User Story 4 — Pasta IMPCG sem Graph Mail (Priority: P1)

Como sistema, se as caixas Exchange estiverem indisponíveis
(dehydrated / 403) mas o PDF já estiver na pasta IMPCG do arquivo
da empresa, eu leio o arquivo que já está lá, extraio o ofício e
crio a linha. Não reenvio o PDF. A lista continua lendo só o
Postgres — o arquivo sozinho não cria linha.

**Why this priority**: o único ofício conhecido (17673) já está na
pasta; sem varredura da pasta a tela fica vazia.

**Independent Test**: mock da pasta com `OFICIO 17673 ….pdf` cria
uma linha; segunda varredura não duplica; Graph Mail 403 ainda
importa o arquivo da pasta.

**Acceptance Scenarios**:

1. **AC-013** — Given um PDF já na pasta
   `1 - DOCUMENTOS/0 - AUTORIZACOES/IMPCG` cujo número de ordem
   ainda não existe no cadastro, when a coleta roda (worker ou
   “Atualizar agora”), then MUST criar exatamente uma autorização
   com o `oneDriveItemId` já conhecido e MUST NOT reenviar o
   arquivo (FAIL-002 não se aplica a arquivo já na pasta).
2. **AC-014** — Given a autorização 17673 já gravada, when a
   varredura da pasta roda de novo, then MUST NOT criar segunda
   linha. Graph Mail 403 MUST NOT impedir a varredura da pasta.

### Edge cases

- Uma caixa responde e a outra falha: processa a que respondeu;
  tenta a outra depois; dedup evita duplicata.
- Leitura do documento falha: o arquivo ainda MUST ir para a pasta
  IMPCG; a linha fica com estado de leitura falha; paciente pelo
  assunto se der; o PDF continua abrível.
- Soma dos itens diferente do total do ofício: persiste os dois;
  estado parcial; não inventa valor.
- Gravação na pasta da empresa falha: MUST NOT confirmar a
  autorização; tenta de novo. Sem arquivo na pasta, não há linha
  concluída.
- Coleta da caixa falha (sem permissão, tempo esgotado): registra
  erro; não apaga linhas já gravadas; MUST ainda varrer a pasta
  IMPCG.
- PDF já na pasta: MUST NOT reenviar; usa o itemId existente.
  Sem número de ofício no texto nem no nome do arquivo, MUST NOT
  criar linha nem inventar itens.

## Requirements

### Functional requirements

- **FR-001**: O menu MUST ter o grupo **Gestão** e a página **IMPCG**
  em `/gestao/impcg`.
- **FR-002**: Acesso à página e à API MUST exigir a página na lista
  do usuário, salvo admin. Autorização no servidor.
- **FR-003**: A coleta MUST ler sempre as duas caixas
  `marcelo@qlmed.com.br` e `flavio@qlmed.com.br`, filtrando remetente
  `compras.impcg@gmail.com` com anexo de ordem.
- **FR-004**: A coleta MUST gravar o PDF na pasta de autorizações
  IMPCG do arquivo da empresa antes de considerar a autorização
  concluída.
- **FR-005**: Deduplicação MUST usar o identificador da mensagem e o
  número da ordem de fornecimento, por empresa.
- **FR-006**: Quando o documento for legível, a leitura MUST obter
  data do ofício, número, paciente, matrícula se houver, médico, CRM
  se houver, procedimento, hospital (local de entrega), itens
  aprovados e totais. Dinheiro MUST ser inteiro em centavos (ou
  decimal de dinheiro), nunca fração binária. Documento ilegível
  segue FAIL-003 — não inventar campo.
- **FR-007**: A lista MUST mostrar data, número, paciente, médico,
  hospital, total em reais e ação de arquivo. No card
  compacto/celular MUST mostrar paciente, local e médico e MUST NOT
  mostrar o valor. Itens e PDF no popup.
- **FR-008**: Estado de leitura parcial ou falha MUST aparecer na
  linha sem impedir abrir o PDF. Parcial MUST mostrar, na lista e
  no cabeçalho do popup, o que faltou (campos vazios ou soma das
  linhas ≠ total), derivado dos dados já persistidos — sem coluna
  nova. Falha MUST dizer que não foi possível ler o documento.
  Ok MUST NOT exibir texto de falta.
- **FR-009**: Viewer MUST NOT disparar coleta. Editor ou admin com a
  página MAY disparar a mesma coleta da rotina.
- **FR-010**: A primeira execução MUST varrer o histórico das duas
  caixas, não só a caixa de entrada recente.
- **FR-011**: A coleta MUST varrer os PDFs da pasta IMPCG do
  arquivo da empresa mesmo quando as caixas Graph falharem.
  Arquivo já na pasta MUST ser associado pelo itemId, sem
  reenvio. Oficio `ok` MUST ser ignorado. Oficio `parcial` MAY
  ser relido para preencher data/campos que o OCR perdeu.
- **FR-012**: Editor ou admin com a página MAY completar na tela
  só os campos ainda vazios (data, paciente, médico, CRM,
  procedimento, hospital). Viewer MUST NOT editar. Depois do
  preenchimento o estado de leitura MUST ser recalculado.

### Failure cases

- **FAIL-001**: Falha ao ler uma caixa — não abortar a outra; não
  apagar cadastro existente.
- **FAIL-002**: Falha ao gravar o arquivo na pasta IMPCG — não
  confirmar autorização nova. Não se aplica quando o PDF já está
  na pasta (backfill por itemId conhecido).
- **FAIL-003**: Falha ao ler o documento — gravar arquivo; linha com
  falha; não inventar itens nem totais.
- **FAIL-004**: Totais inconsistentes no documento — persistir
  parcial, sem “corrigir” o total.

### Non-functional

- Sem senha, token ou e-mail completo em log. Sem payload clínico
  completo em log (itens e valores só em persistência).
- Coleta com tempo limitado por caixa; falha explícita se estourar.
- Evidência: testes de dedup, leitura da ordem 17673 (centavos), ACL
  403, e “sem arquivo na pasta ⇒ sem autorização confirmada”.
- Constitui mudança de comportamento, permissão, persistência e
  integração: Spec Kit obrigatório. Migration versionada se o
  cadastro for novo.

### Out of scope

- Outros clientes além da IMPCG.
- Apagar ofício na tela. Editar campo que a leitura já preencheu.
- Gerar financeiro, estoque ou NF-e a partir do ofício.
- Consentimento de leitura de e-mail em todo o tenant (o recorte é
  só as duas caixas).
- Download em lote de PDFs.
- Outras páginas do grupo Gestão.

### Test strategy

- Leitura: fixture da ordem 17673 (paciente, médico, hospital,
  três itens, total 1.255.000 centavos).
- Dedup: mesma mensagem em duas caixas → 1 linha; mesmo número → 1
  linha.
- ACL: viewer sem página → 403.
- Pasta: falha ao gravar arquivo (origem e-mail) → nenhuma
  autorização nova confirmada. PDF já na pasta → uma linha sem
  reenvio; segunda varredura não duplica; Graph 403 ainda importa
  o arquivo da pasta.
- Validação do repositório: `docs:validate`, verificação de tipos,
  lint e testes automatizados.

## Key entities

- **Autorização IMPCG**: uma ordem de fornecimento (número único por
  empresa), cabeçalho clínico/comercial, total, estado da leitura,
  referência ao arquivo na pasta IMPCG, identificadores das
  mensagens já consumidas.
- **Item aprovado**: linha de material (registro, descrição, marca,
  referência, quantidade, unitário, total da linha) pertencente a
  uma autorização.
- **Mensagem de origem**: e-mail do remetente Compras Impcg em uma
  das duas caixas, usado só para coletar e deduplicar.

## Success Criteria

- **SC-001**: Um operador com permissão encontra uma autorização
  conhecida (ex.: ordem 17673) na lista e abre o PDF no popup em
  menos de 30 segundos após entrar na página.
- **SC-002**: 100% dos envios de teste presentes nas duas caixas
  com o mesmo número de ordem geram uma única linha.
- **SC-003**: 100% das autorizações confirmadas na lista têm o PDF
  correspondente na pasta IMPCG do arquivo da empresa.
- **SC-004**: Na fixture da ordem 17673, o total exibido é
  R$ 12.550,00 e a soma das três linhas de item fecha esse valor.
- **SC-005**: Usuário sem a página não lista nem abre arquivo
  (recusa do servidor).

## Assumptions

- As caixas `marcelo@qlmed.com.br` e `flavio@qlmed.com.br` passarão a
  ser lidas pela aplicação com recorte só a essas caixas (customização
  do correio da organização em andamento no tenant).
- A conta de arquivo já conectada ao QLMED (`faturamento@qlmed.com.br`)
  permanece a dona da pasta
  `1 - DOCUMENTOS/0 - AUTORIZACOES/IMPCG`.
- O documento típico é “Ordem de Fornecimento” da IMPCG/Prefeitura,
  frequentemente digitalizado; o nome do paciente pode estar no
  assunto ou no documento.
- Data da tabela é a data impressa no ofício, não a data de chegada
  do e-mail. A chegada fica só no cadastro interno.
- Grupo Gestão nesta fatia tem só a página IMPCG.
- Papéis viewer / editor / admin e a lista de páginas continuam os
  do produto atual.
