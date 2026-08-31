---
id: SPEC-025
status: draft
owner: QLMED
related_decisions:
  - ADR-0001
  - ADR-0007
affected_modules:
  - fiscal-issued-ui
  - nfe-emission
  - sefaz-autorizacao
---

# Feature Specification: Emissão manual de NF-e com envio à SEFAZ

**Feature Branch**: `feat/emissao-nota-fiscal`

**Created**: 2026-08-30

**Status**: Draft

**Input**: Página de emissão manual de NF-e no QLMED. Todas as
naturezas de saída já usadas no produto (venda, consignação,
comodato, demonstração, etc.). Destinatário só cliente pessoa
jurídica já cadastrado. A primeira entrega já envia a nota à SEFAZ
para autorização.

## Problem

O QLMED lista NF-e que a empresa já emitiu em outro sistema. O
operador não consegue montar e autorizar uma nota de saída pelo
próprio app. Precisa de uma tela manual que cubra as operações de
saída do dia a dia e que, ao confirmar, peça autorização à SEFAZ.

## Roles and ownership

- **Operador (viewer) com NF-e Emitidas**: vê a página e os
  rascunhos; não envia.
- **Editor ou admin com NF-e Emitidas**: cria rascunho, edita e
  envia à SEFAZ.
- Isolamento: companyId derivado do usuário autenticado. Sem
  companyId no request.

## User scenarios and testing

### User Story 1 — Montar a nota com qualquer saída (Priority: P1)

Como editor, abro **Nova NF-e** a partir de NF-e Emitidas e escolho
a natureza (venda, consignação, comodato, demonstração, bonificação,
amostra, devolução de compra, conserto e as demais saídas já
etiquetadas no produto). Informo cliente PJ cadastrado e itens do
cadastro de produtos. Salvo rascunho.

**Why this priority**: Sem a tela não há o que enviar.

**Independent Test**: Criar rascunhos com naturezas diferentes;
todas persistem com o CFOP correspondente.

**Acceptance Scenarios**:

1. **AC-001** — Given o operador com permissão de escrita em NF-e
   Emitidas, when abre Nova NF-e, then vê todas as naturezas de
   saída do catálogo fiscal do produto: no topo as 5 mais usadas
   nas emitidas reais (CFOP 5102, 6102, 5917, 1918, 6917), uma
   linha separadora, e o restante em ordem numérica de CFOP.
2. **AC-002** — Given um rascunho com natureza Consignação, when
   salva, then o documento fica gravado com essa natureza e o CFOP
   de consignação compatível com a UF do destinatário.
3. **AC-003** — Given um rascunho, when o total dos itens é
   calculado, then o valor da nota é a soma dos itens (quantidade ×
   unitário − desconto), sem o operador digitar o total.

### User Story 2 — Destinatário só cliente PJ cadastrado (Priority: P1)

Como editor, só escolho destinatário entre clientes pessoa jurídica
já cadastrados. No mesmo campo, busco por razão social, nome
fantasia ou CNPJ (com ou sem pontuação). Não digito um CNPJ solto
nem CPF de particular. Depois de escolher, vejo o endereço em uma
linha curta e discreta, só se o cadastro tiver município ou UF.

**Why this priority**: Decisão explícita de produto.

**Independent Test**: Tentativa com CNPJ que não é cliente cadastrado
é recusada. Trecho de nome e CNPJ mascarado filtram a mesma lista
da empresa autenticada.

**Acceptance Scenarios**:

1. **AC-004** — Given um CNPJ que é cliente da empresa, when o
   operador seleciona esse cliente, then a nota usa razão social,
   IE e endereço do cadastro.
2. **AC-005** — Given um CNPJ que não é cliente cadastrado, when
   tenta salvar ou enviar, then o sistema recusa.
3. **AC-006** — Given um CPF (11 dígitos), when tenta usar como
   destinatário, then o sistema recusa.
4. **AC-016** — Given clientes PJ da empresa com razões distintas,
   when o operador digita um trecho da razão social ou do nome
   fantasia no campo único de busca, then a lista mostra só os
   coincidentes da própria empresa.
5. **AC-017** — Given um cliente com CNPJ conhecido, when o
   operador digita o CNPJ com pontuação ou só com dígitos no mesmo
   campo, then a lista inclui esse cliente e não mistura cadastro
   de outra empresa.
6. **AC-018** — Given destinatário selecionado cujo cadastro tem
   cidade e UF (e opcionalmente bairro ou logradouro), when a
   seleção aparece, then o operador vê uma única linha sucinta
   (cidade/UF, ou bairro e cidade/UF, ou logradouro curto e
   cidade/UF), em texto discreto, sem destaque visual, sem CEP,
   complemento nem inscrição estadual.
7. **AC-019** — Given destinatário selecionado sem município nem
   UF no cadastro, when a seleção aparece, then o sistema não
   inventa linha de endereço.

### User Story 3 — Enviar à SEFAZ (Priority: P1)

Como editor, confirmo o envio. O sistema assina a nota com o
certificado da empresa, transmite à SEFAZ e, se autorizada, a nota
aparece em NF-e Emitidas.

**Why this priority**: Pedido da primeira entrega.

**Independent Test**: Envio em homologação (ou cliente de teste)
autoriza ou devolve o motivo da rejeição na própria tela.

**Acceptance Scenarios**:

1. **AC-007** — Given um rascunho completo, certificado válido e
   emitente conhecido, when o editor envia, then a SEFAZ recebe a
   nota e o operador vê autorizado ou o motivo da rejeição.
2. **AC-008** — Given autorização homologada, when o operador volta
   a NF-e Emitidas, then a nota aparece como emitida, com número,
   chave e destinatário.
3. **AC-009** — Given rejeição da SEFAZ, when o retorno chega, then
   o rascunho permanece editável e o número oficial não é
   consumido se a SEFAZ não autorizou a numeração.

### User Story 5 — Tela completa no padrão de emissor (Priority: P1)

Como editor, preencho a nota em seções (dados, itens, transporte,
pagamento e complementos) na mesma página rolável, com painel de
totais e pendências, no mesmo recorte que Bling/Conta Azul e os
grupos do MOC 7.0 (`ide`, `dest`, `det`, `transp`, `pag`, `total`,
`infAdic`). Os botões do topo (Dados, Itens, Transporte, Pagamento,
Complementos) levam até a seção; não escondem o restante.

**Acceptance Scenarios**:

1. **AC-011** — Given a tela Nova NF-e, when o operador navega,
   then vê na mesma página as seções Dados, Itens, Transporte,
   Pagamento e Complementos (todas visíveis com rolagem) e um
   resumo com produtos, desconto, frete, seguro, outras e total.
2. **AC-012** — Given frete, PIX e texto complementar preenchidos,
   when o XML é gerado, then constam `modFrete`, `tPag`, `vFrete`
   e `infCpl` / `infAdFisco`.
3. **AC-020** — Given a tela Nova NF-e na seção Dados, when o
   operador vê o formulário, then o destinatário é o primeiro
   controle significativo da seção inicial, e no bloco de
   identificação a série (visível, compacta e não editável)
   fica entre natureza e finalidade.
4. **AC-026** — Given a tela Nova NF-e na seção Dados em viewport
   tablet/desktop, when o operador vê o bloco de identificação,
   then Série, Finalidade e Consumidor final aparecem na mesma
   linha (layout compacto). Em viewport estreita (~390px) o trio
   MAY quebrar com wrap responsivo.

### User Story 7 — Etapas na mesma página (Priority: P1)

Como editor, percorro as seções já existentes sem trocar de
tela. Clico no botão do topo para ir até a seção. O botão da
seção visível (ou a que acabei de escolher) fica ativo. Ao
terminar uma etapa, clico **Concluir nesta etapa**; se o mínimo
daquela etapa estiver ok, a página vai sozinha para a próxima.
Se faltar algo, vejo o que falta e não saio do lugar. A última
seção não tem esse botão: o envio continua no fluxo já existente
de rascunho / transmitir.

**Why this priority**: O operador precisa ver o contexto da nota
inteira e avançar só quando decidir, sem wizard nem avanço por
sair do campo.

**Independent Test**: Nav para uma seção posterior deixa as
anteriores visíveis ao rolar para cima. Concluir Dados sem
destinatário não avança. Concluir Dados com destinatário e
natureza avança para Itens.

**Acceptance Scenarios**:

1. **AC-021** — Given a tela Nova NF-e, when o operador clica em
   Itens (ou Transporte, Pagamento, Complementos) no topo, then a
   página foca essa seção sem esconder as demais, e o botão
   clicado fica ativo.
2. **AC-022** — Given a seção Dados incompleta (sem destinatário
   PJ ou sem natureza), when o operador clica em Concluir nesta
   etapa, then a página não avança e o botão (ou o texto junto
   dele) explica o que falta.
3. **AC-023** — Given a seção Dados com destinatário e natureza
   preenchidos, when o operador clica em Concluir nesta etapa,
   then a página vai para Itens e o botão Itens fica ativo.
4. **AC-024** — Given o operador rolando a página à mão, when
   outra seção passa a ser a principal visível, then o botão do
   topo correspondente fica ativo.
5. **AC-025** — Given a última seção (Complementos), when o
   operador chega ao fim, then não há Concluir nesta etapa; o
   rascunho e a transmissão seguem o fluxo já existente.

### User Story 4 — Viewer não envia (Priority: P2)

Quem só lê não dispara autorização.

**Acceptance Scenarios**:

1. **AC-010** — Given um viewer, when abre Nova NF-e, then não vê
   ação de enviar, e o servidor recusa o envio.

### User Story 6 — Ambiente e teste de conexão (Priority: P1)

Como admin, escolho Homologação ou Produção no certificado A1 já
instalado, sem reenviar o PFX. Testo a conexão com a SEFAZ só
consultando se o serviço está no ar — sem autorizar NF-e.

**Why this priority**: Sem o seletor, o certificado fica em
produção e qualquer envio tem valor fiscal. O teste de conexão
precisa existir antes da primeira nota.

**Independent Test**: Trocar o ambiente persiste; o teste devolve
status do serviço e não cria nota emitida.

**Acceptance Scenarios**:

1. **AC-013** — Given um certificado instalado, when o admin
   escolhe Homologação e grava, then o ambiente persistido passa a
   ser homologação e a próxima emissão usa esse ambiente.
2. **AC-014** — Given certificado válido, when o admin testa a
   conexão, then o sistema consulta só o status do serviço na SEFAZ
   e mostra o código e o motivo; não autoriza NF-e e não grava
   Invoice.
3. **AC-015** — Given certificado ausente ou vencido, when tenta
   testar a conexão, then o servidor recusa sem chamar a SEFAZ.

## Requirements

### Functional requirements

- **FR-001**: A página Nova NF-e MUST oferecer todas as naturezas
  de saída já etiquetadas no produto (venda, consignação, comodato,
  retorno de comodato, bonificação, amostra, demonstração, outras
  saídas, uso externo, devolução de compra, conserto e equivalentes
  interestaduais) e as devoluções de entrada já usadas nas emitidas
  (1202, 1918, 2202, 2918). O dropdown de natureza/CFOP MUST listar
  no topo as 5 naturezas mais usadas nas NF-e emitidas reais (CFOP
  5102, 6102, 5917, 1918, 6917 — ranking medido nas emitidas em
  janela de 30 dias até 2026-08-28), MUST exibir uma linha
  separadora, e MUST listar o restante do catálogo em ordem
  numérica de CFOP, sem duplicar os do topo.
- **FR-002**: O destinatário MUST ser cliente pessoa jurídica
  cadastrado da empresa. CPF e CNPJ fora do cadastro de clientes
  MUST ser recusados no servidor.
- **FR-003**: Itens MUST vir do cadastro de produtos da empresa
  (código, descrição, NCM, unidade, CFOP de saída, ANVISA quando
  houver). Quantidade e valor unitário são informados na nota.
- **FR-004**: CFOP MUST ser coerente com a UF do emitente e do
  destinatário (interno vs interestadual).
- **FR-005**: Totais MUST ser calculados a partir dos itens, com
  arredondamento monetário half-up em duas casas.
- **FR-006**: Enviar MUST assinar e transmitir à SEFAZ no ambiente
  configurado no certificado (produção ou homologação).
- **FR-007**: Nota autorizada MUST passar a existir como NF-e
  emitida da empresa, com XML autorizado guardado, sem logar o XML
  completo nem o certificado.
- **FR-008**: Rascunho MUST viver fora da lista de emitidas até a
  autorização.
- **FR-009**: Autorização e persistência MUST usar a empresa do
  usuário autenticado. Papel viewer MUST NÃO enviar.
- **FR-010**: Sem certificado válido, emitente incompleto ou
  endereço do destinatário incompleto, o envio MUST falhar com
  mensagem acionável, sem chamar a SEFAZ.
- **FR-011**: O formulário MUST cobrir finalidade, presença,
  transporte (`modFrete`, volumes, transportadora), pagamento
  (`tPag`/`indPag`) e informações adicionais, persistidos no
  rascunho e emitidos no XML.
- **FR-012**: Admin MUST poder gravar o ambiente do certificado
  (`homologation` ou `production`) sem reenviar o PFX. Viewer e
  editor MUST NÃO alterar o ambiente. O ambiente da emissão MUST
  ser o persistido no certificado, não um valor enviado no request
  de autorização.
- **FR-013**: Testar conexão MUST consultar só o status do serviço
  da SEFAZ no ambiente do certificado. MUST NÃO montar nem enviar
  lote de autorização. MUST NÃO criar rascunho nem Invoice.
- **FR-014**: A sincronização operacional DistDFe MUST permanecer
  em produção mesmo quando o certificado está em homologação, para
  não misturar NSU de teste com documentos reais.
- **FR-015**: O XML de emissão MUST repetir o DNA fiscal das NF-e
  já autorizadas desta empresa: CRT 3 com ICMS CST 40 (não CSOSN
  nem CST 41), PIS/COFINS CST 01 com alíquotas 0,65% e 3% e totais
  batendo no `ICMSTot`, venda com `tPag` 15 a prazo + `cobr/dup`,
  `modFrete` 0, `indPres` 9, série 2, `natOp` no texto curto já
  autorizado (ex.: *Venda merc.adq. ou recb. terc.*), `infAdFisco`
  com Ajuste SINIEF 02/24 e `infCpl` com Convênio ICMS 01/99.
  Remessa e devolução MUST usar `tPag` 90 sem cobrança. Destinatário
  CPF permanece recusado (FR-002).
- **FR-016**: A emissão manual MUST usar somente a série 2. O campo
  série MUST ser visível, compacto e não editável. Payload e schema
  MUST recusar qualquer série diferente de 2. NF-e históricas série 1
  (trilho raro de importação) MUST permanecer inalteradas na listagem
  e no XML já autorizado.
- **FR-017**: Na seção Dados da Nova NF-e, o destinatário MUST ser o
  primeiro controle significativo (acima dos demais campos dessa
  seção). No bloco de identificação, a ordem visual MUST ser
  Natureza, depois Série (badge compacto não editável, FR-016),
  depois Finalidade. Os demais campos já existentes no bloco
  permanecem depois desse trio. MUST NÃO alterar regra fiscal,
  schema de série, defaults XML nem outras telas.
- **FR-018**: O campo único de busca de destinatário na Nova NF-e
  MUST aceitar razão social, nome fantasia ou CNPJ (com ou sem
  pontuação) e MUST filtrar apenas clientes pessoa jurídica da
  empresa do usuário autenticado. MUST NÃO exigir um segundo campo
  nem vazar destinatário de outra empresa.
- **FR-019**: Após selecionar o destinatário, a tela MUST mostrar o
  endereço de forma sucinta (cidade/UF, ou bairro e cidade/UF, ou
  logradouro curto e cidade/UF) em texto discreto, sem destaque
  visual. MUST NÃO exibir CEP, complemento nem inscrição estadual
  nessa linha. MUST NÃO inventar endereço quando o cadastro não
  tiver município nem UF.
- **FR-020**: A Nova NF-e MUST mostrar as seções já existentes
  (Dados, Itens, Transporte, Pagamento, Complementos) na mesma
  página, em uma coluna rolável. MUST NÃO esconder as demais seções
  ao escolher um botão do topo. Esses botões MUST focar a seção
  correspondente e MUST ficar no estado ativo da seção visível ou
  da seção recém-escolhida. O ativo MUST se distinguir dos inativos
  por preenchimento, peso tipográfico e borda/anel — não só por
  cor. Os inativos MUST parecer recuados. Rolagem manual MUST atualizar o botão
  ativo. MUST NÃO inventar seções novas.
- **FR-021**: Cada seção, exceto a última, MUST oferecer o botão
  **Concluir nesta etapa**. O clique MUST validar só o mínimo
  daquela etapa. Se completo, a página MUST ir à próxima seção. Se
  incompleto, MUST explicar o que falta e MUST NÃO avançar. MUST
  NÃO avançar só porque o operador saiu de um campo. A última seção
  MUST permanecer no fluxo existente de rascunho / transmitir.
- **FR-022**: No bloco de identificação da Nova NF-e, Série,
  Finalidade e Consumidor final MUST compartilhar a mesma linha em
  viewport tablet/desktop (layout compacto). Em viewport estreita
  (~390px) o trio MAY usar wrap responsivo (`flex-wrap` /
  `sm:grid-cols-3`). Comportamento dos campos (badge série 2 fixa,
  opções de finalidade e consumidor final) MUST permanecer o de
  FR-011/FR-016. MUST NÃO alterar regra fiscal, schema, defaults
  XML nem outras telas.

### Failure cases

- **FAIL-001**: Cliente inexistente ou CPF — recusar.
- **FAIL-002**: Certificado ausente ou vencido — recusar envio.
- **FAIL-003**: SEFAZ rejeita — mostrar motivo; rascunho editável.
- **FAIL-004**: Timeout ou HTTP da SEFAZ — falha explícita; não
  inventar autorização.
- **FAIL-005**: CFOP incompatível com UF — recusar antes do envio.
- **FAIL-006**: Teste de conexão sem certificado ou com certificado
  vencido — recusar sem chamar a SEFAZ.
- **FAIL-007**: Status do serviço indisponível ou rejeição da
  consulta — mostrar o motivo; não inventar sucesso.
- **FAIL-008**: Payload de emissão com série diferente de 2 —
  recusar no schema, sem autorizar.

### Non-functional

- Sem XML fiscal completo, senha de certificado ou PFX em log.
- Dinheiro só com decimal half-up (SPEC-004).
- Timeout limitado na chamada à SEFAZ, no mesmo espírito do DistDFe.
- Migration só de expansão.
- Evidência: testes de regra (destinatário, CFOP, totais, chave) e
  de autorização com SEFAZ substituída por dublê.

### Out of scope

- NFS-e, NFC-e, CT-e.
- Nota complementar, ajuste, crédito e débito.
- Cancelamento e carta de correção originados nesta tela.
- Motor tributário completo de IBS/CBS além do grupo mínimo
  exigido para a operação autorizar.
- Emissão para destinatário não cadastrado.

## Key entities

- **Rascunho de emissão**: nota ainda não autorizada.
- **NF-e emitida**: documento autorizado que entra na lista já
  existente.
- **Cliente PJ**: contato de destinatário com CNPJ no cadastro de
  clientes.
- **Operação de saída**: natureza + CFOP do catálogo do produto.

## Success Criteria

- **SC-001**: Editor completa uma venda ou consignação para cliente
  cadastrado e dispara o envio sem sair do QLMED.
- **SC-002**: 100% dos testes de destinatário inválido (CPF ou não
  cliente) recusam; 100% dos CFOP de saída do catálogo são
  selecionáveis.
- **SC-003**: Nota autorizada aparece em NF-e Emitidas na mesma
  sessão de trabalho após o retorno da SEFAZ.
- **SC-004**: Viewer não consegue autorizar pelo servidor.
- **SC-005**: Admin grava Homologação sem reenviar o PFX e o teste
  de conexão devolve status do serviço sem criar NF-e.
- **SC-006**: Editor localiza o destinatário pelo nome ou pelo CNPJ
  no mesmo campo e, ao selecionar, reconhece a cidade/UF quando o
  cadastro tem esse dado — sem bloco destacado de endereço.
- **SC-007**: Editor vê todas as seções da nota na mesma rolagem,
  usa o topo só para ir até uma seção, e só avança de etapa pelo
  botão Concluir nesta etapa quando o mínimo da etapa está ok.

## Assumptions

- A empresa já emite NF-e modelo 55 e tem certificado A1 no
  QLMED; o emitente (IE, CRT, endereço) sai da última NF-e emitida
  sincronizada.
- Ambiente de emissão (homologação/produção) é o do certificado e
  o admin pode trocá-lo sem reenviar o A1. DistDFe operacional
  continua em produção.
- Homologação usa o destinatário-padrão exigido pela SEFAZ nesse
  ambiente.
- O DNA fiscal de FR-015 foi medido nas 144 NF-e emitidas dos 30
  dias até 2026-08-28 (série 2, verProc 7.159.03). QLMED não copia
  o `infRespTec` da Joinner — o responsável técnico do QLMED fica
  para fatia seguinte, se a SEFAZ-MS exigir.
- Numeração oficial é por série, sequencial, persistida só quando
  o envio é aceito para processamento; rejeição sem autorização
  devolve o número.
- QLMED opera em uma UF (hoje MS); o autorizador é o da UF do
  emitente.

## Prior Art

Ver [research.md](./research.md). Decisões do produto em 2026-08-30:
todas as saídas; só cliente PJ; primeira entrega envia à SEFAZ.
NSDocs não emite. Provedor SaaS (Focus/PlugNotas) fica de fora
desta fatia — envio direto com o A1 já persistido.
