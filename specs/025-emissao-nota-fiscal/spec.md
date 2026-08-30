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
   saída do catálogo fiscal do produto.
2. **AC-002** — Given um rascunho com natureza Consignação, when
   salva, then o documento fica gravado com essa natureza e o CFOP
   de consignação compatível com a UF do destinatário.
3. **AC-003** — Given um rascunho, when o total dos itens é
   calculado, then o valor da nota é a soma dos itens (quantidade ×
   unitário − desconto), sem o operador digitar o total.

### User Story 2 — Destinatário só cliente PJ cadastrado (Priority: P1)

Como editor, só escolho destinatário entre clientes pessoa jurídica
já cadastrados. Não digito um CNPJ solto nem CPF de particular.

**Why this priority**: Decisão explícita de produto.

**Independent Test**: Tentativa com CNPJ que não é cliente cadastrado
é recusada.

**Acceptance Scenarios**:

1. **AC-004** — Given um CNPJ que é cliente da empresa, when o
   operador seleciona esse cliente, then a nota usa razão social,
   IE e endereço do cadastro.
2. **AC-005** — Given um CNPJ que não é cliente cadastrado, when
   tenta salvar ou enviar, then o sistema recusa.
3. **AC-006** — Given um CPF (11 dígitos), when tenta usar como
   destinatário, then o sistema recusa.

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
pagamento e complementos) com painel de totais e pendências, no
mesmo recorte que Bling/Conta Azul e os grupos do MOC 7.0
(`ide`, `dest`, `det`, `transp`, `pag`, `total`, `infAdic`).

**Acceptance Scenarios**:

1. **AC-011** — Given a tela Nova NF-e, when o operador navega,
   then vê abas Dados, Itens, Transporte, Pagamento e Complementos
   e um resumo com produtos, desconto, frete, seguro, outras e
   total.
2. **AC-012** — Given frete, PIX e texto complementar preenchidos,
   when o XML é gerado, then constam `modFrete`, `tPag`, `vFrete`
   e `infCpl` / `infAdFisco`.

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
  interestaduais).
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

## Assumptions

- A empresa já emite NF-e modelo 55 e tem certificado A1 no
  QLMED; o emitente (IE, CRT, endereço) sai da última NF-e emitida
  sincronizada.
- Ambiente de emissão (homologação/produção) é o do certificado e
  o admin pode trocá-lo sem reenviar o A1. DistDFe operacional
  continua em produção.
- Homologação usa o destinatário-padrão exigido pela SEFAZ nesse
  ambiente.
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
