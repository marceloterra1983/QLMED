# Research: emissão manual de NF-e (primeira página)

**Feature**: SPEC-025 (rascunho)  
**Branch**: `feat/emissao-nota-fiscal`  
**Worktree**: `.worktrees/emissao-nota-fiscal`  
**Data**: 2026-08-30  
**Pergunta**: como desenvolver uma página de emissão **manual** de nota fiscal para começar.

## Decisões de produto (2026-08-30)

1. Todas as naturezas de saída do catálogo (`cfop.ts`), não só venda.
2. Destinatário só cliente PJ cadastrado.
3. A primeira entrega **envia à SEFAZ** (não é só rascunho).

## Conclusão

O QLMED hoje **ingere e opera** NF-e já autorizadas. Esta fatia adiciona
emissão manual modelo 55, com todas as saídas, destinatário PJ cadastrado
e autorização na SEFAZ com o A1 já persistido.

Veredito Prior Art: **compose** cadastros + A1 + tipos `NFe*` e **build**
XML + assinatura + `NFeAutorizacao4`. Não adotar Focus/PlugNotas. NSDocs
**não emite**.

## Estado atual do produto

O overview em `docs/architecture/overview.md` descreve o QLMED como app de
receber, organizar e operar documentos fiscais. O diagrama
`docs/architecture/diagrams/07-invoice-sync` e os clientes confirmam só sync:

| Peça | Papel hoje | Emite? |
|------|------------|--------|
| `syncViaSefaz` | DistDFe / documentos novos | Não |
| `syncViaNsdocs` | Lista + `recuperarXml` / PDF | Não |
| `ReceitaNfseClient` | NFS-e por NSU / eventos | Não |
| `/fiscal/issued` | Lista NF-e **já emitidas** (direction=`issued`) | Não |
| `Invoice` | Exige `accessKey` único + `xmlContent` | Documento autorizado |
| `CertificateConfig` | PFX A1 para consulta SEFAZ | Assinatura de **entrada** |
| `NsdocsClient` | `listarDocumentos`, `recuperarXml`, `consultarCnpj` | Sem endpoint de autorização |

`resolveInvoiceDirection` marca `issued` quando o CNPJ do emitente do XML é o
da empresa. Ou seja: “NF-e Emitidas” é o que a empresa **já emitiu em outro
sistema** e o QLMED sincronizou.

Não há rota, botão nem menu “Nova nota” / “Emitir”.

## Por que não gravar rascunho em `Invoice`

`prisma/schema.prisma` (`model Invoice`):

- `accessKey` é `@unique` e obrigatório — rascunho não tem chave.
- `xmlContent` é `String` obrigatório — rascunho não tem XML autorizado.
- `status` é `received | confirmed | rejected` (ciclo de **entrada**).
- `number` / `series` / `issueDate` / `sender*` / `totalValue` assumem documento
  já formado.

Misturar rascunho nessa tabela quebra a lista de emitidas, o sync e o
financeiro. A primeira página precisa de tabela própria (ex.: `InvoiceDraft`).

## O que já dá para reutilizar na página

### Emitente (somente leitura no formulário)

`Company`: `cnpj`, `razaoSocial`, `nomeFantasia`. **Falta** IE, CRT, endereço,
município IBGE — obrigatórios no XML (`NFeEmit`). Na primeira página basta
mostrar CNPJ/razão; completar cadastro fiscal do emitente é fatia seguinte.

`CertificateConfig` já guarda A1 (`pfxData`, senha cifrada, validade, CNPJ do
certificado). Serve depois para assinar; **não** usar no browser.

### Destinatário

- `GET /api/customers` — lista de clientes da empresa.
- `ContactFiscal` — IE, IM, CRT, UF, cidade por CNPJ.
- `ContactOverride` — telefone, e-mail, logradouro, número, bairro, cidade, UF, CEP.
- `ContactNickname` — nome curto na UI.
- Tipos XML já modelados: `NFeDest`, `NFeEndereco` em `src/types/nfe-xml.ts`.

### Itens

- `GET /api/products/list` — `ProductRegistry` com código, descrição, NCM, EAN,
  unidade, `fiscalCfopSaida`, CST/alíquotas ICMS/PIS/COFINS/IPI, CEST, origem,
  `anvisaCode` (grupo `med` da NF-e de material médico).
- `NcmCache` — descrição de NCM.
- `src/lib/cfop.ts` — tags de saída (`5102`/`6102` = Venda, `5917`/`6917` =
  Consignação, etc.).

### UI e contrato visual

- Lista: `/fiscal/issued` (`IssuedInvoicesPage`).
- Detalhe já parseia o XML completo (`NfeDetailsModal`, `InvoiceDetailsModal`).
- Menu: `SidebarNav` → “NF-e Emitidas”. Entrada natural: botão **Nova NF-e**
  nessa página, rota nova `/fiscal/emitir`.
- Padrão de formulário: inputs com `FILTER_INPUT_CLS`, Zod nas rotas, auth via
  `requireAuth` + `getOrCreateSingleCompany`, UI pt-BR, Material Symbols,
  sem biblioteca de componentes.

## Campos da primeira página (rascunho de venda)

Escopo sugerido: **uma NF-e 55 de saída, finalidade normal (`finNFe=1`)**,
operação mais comum (venda). Campos editáveis:

### Operação

| Campo | Origem / default | Obrigatório no rascunho |
|-------|------------------|-------------------------|
| Natureza da operação | texto, default “Venda” | sim |
| CFOP padrão da nota | select das saídas em `cfop.ts` (5102/6102) | sim |
| Data de emissão | hoje | sim |
| Consumidor final | `indFinal` 0/1 | sim |
| Presença | `indPres` (presencial / internet / outros) | sim |
| Série | default `1`, editável | sim |
| Número | vazio até autorizar; no rascunho opcional | não |

### Destinatário

| Campo | Reutilizar | Obrigatório no rascunho |
|-------|------------|-------------------------|
| Busca cliente | `/api/customers` | sim (CNPJ ou CPF) |
| Razão social | cadastro / override | sim |
| IE + `indIEDest` | `ContactFiscal` | sim se contribuinte |
| Endereço completo | `ContactOverride` | sim (logradouro, nro, bairro, cidade, UF, CEP) |
| E-mail | override | não |

Município IBGE (`cMun`) pode faltar no cadastro — validar e pedir se ausente.

### Itens (N linhas)

| Campo | Reutilizar | Obrigatório no rascunho |
|-------|------------|-------------------------|
| Produto | `/api/products/list` | sim |
| Descrição / NCM / unidade / EAN | `ProductRegistry` | sim (NCM + qtd + valor) |
| CFOP do item | `fiscalCfopSaida` ou CFOP da nota | sim |
| Quantidade e valor unitário | digitados; último preço de venda como hint (`aggLastSalePrice`) | sim |
| Desconto / frete no item | digitados | não |
| ANVISA | `anvisaCode` → `cProdANVISA` | se produto médico tiver código |
| Impostos | **não editar na 1ª página** | — |

Totais da nota: soma dos itens com `Decimal` (SPEC-004). Operador não digita
o total.

### Ações da página

1. **Salvar rascunho** — persiste, volta a uma lista de rascunhos ou à própria
   tela.
2. **Validar** — checagens locais (CNPJ, CEP, CFOP vs UF, totais).
3. **Enviar à SEFAZ** — assina com A1 e chama NFeAutorizacao4.

## Fora desta fatia

- Contingência, inutilização, cancelamento e CC-e originados nesta tela.
- Cancelamento / CC-e originados no QLMED (hoje o cancelamento é **lido** no
  sync — SPEC-020/022).
- NFS-e, NFC-e 65, CT-e, complementar, ajuste, devolução, crédito/débito.
- Motor tributário completo (CST, IBS/CBS 2026, ST, DIFAL) — o rascunho guarda
  quantidade/valor; imposto entra quando houver provedor ou motor.
- Numeração oficial persistente por série/ambiente.
- Escolha de provedor (Focus NFe, PlugNotas, SOAP direto).
- Gravar na tabela `Invoice` (só depois do protocolo de autorização).
- Completar cadastro fiscal do emitente (IE, CRT, endereço, IBGE).

## Prior Art

### Neste repositório — extend / compose

- Tipos `NFeIde`, `NFeEmit`, `NFeDest`, `NFeProd`, `NFeImposto`, `NFeDet`
  (`src/types/nfe-xml.ts`) — já descrevem o XML que a página precisa produzir
  mais tarde.
- `ProductRegistry.fiscal*` e ANVISA — cadastro de item quase pronto para linha
  da nota.
- Certificado A1 já persistido e cifrado (`CertificateManager`).
- Lista e DANFE de emitidas — destino do documento **depois** de autorizado.

### Fora — não adotar agora

| Candidato | Fit | Motivo |
|-----------|-----|--------|
| NSDocs API | rejeitar como emissor | API pública: listar, importar por chave, manifestar. Sem autorização de saída. [developer.nsdocs.com.br](https://developer.nsdocs.com.br/) |
| Focus NFe | adiar | API REST de emissão assíncrona (`ref` idempotente). Candidato **depois** do rascunho. [doc.focusnfe.com.br](https://doc.focusnfe.com.br/reference/emitir_nfe) |
| PlugNotas | adiar | JSON → autorização + numeração gerenciada. Mesmo momento que Focus. [plugnotas.com.br/nfe](https://plugnotas.com.br/nfe/) |
| SOAP SEFAZ direto | rejeitar na 1ª fatia | Custo de schema, assinatura, lote, contingência e NTs 2025/2026 (IBS/CBS). |

### Norma (campos e 2026)

- MOC 7.0 / Anexo I — leiaute e regras de validação: [Portal NF-e](https://www.nfe.fazenda.gov.br/portal/listaConteudo.aspx?tipoConteudo=ndIjl+iEFdE=).
- NT 2025.002-RTC — IBS/CBS/IS; validações a partir de 2026. Não bloquear o
  rascunho por IBS/CBS; o XML de envio é fatia posterior.
- CFOP oficial: tabela no Portal Nacional.

## Proposta de implementação (quando autorizado)

1. Spec Kit SPEC-025: página + `InvoiceDraft` + “Nova NF-e” em Emitidas.
2. Rota `GET/POST/PATCH /api/invoice-drafts` com Zod, `requireAuth`, company
   derivada do usuário.
3. Página `/fiscal/emitir` (e `?id=` para reabrir rascunho).
4. Tabela `InvoiceDraft`: companyId, status=`draft`, payload JSON versionado
   (destinatário + itens + operação), totais `Decimal`, sem `accessKey`.
5. Testes: auth, isolamento, total dos itens, rascunho não aparece em
   `/fiscal/issued`.

## Página manual — esboço de fluxo

```
NF-e Emitidas  --[Nova NF-e]-->  /fiscal/emitir
                                      |
                    buscar cliente + buscar produto
                                      |
                               Salvar rascunho
                                      |
                         (depois) Enviar SEFAZ --> Invoice issued
```

## Pressupostos

- Primeira operação: venda de mercadoria já cadastrada (material médico).
- Destinatário é cliente PJ com CNPJ no cadastro.
- Homologação vs produção não entra no rascunho.
- Um rascunho por vez na tela; lista de rascunhos pode ser mínima (só os do
  usuário/empresa, status draft).
