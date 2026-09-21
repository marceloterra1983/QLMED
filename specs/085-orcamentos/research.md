# Research: Orçamentos (SPEC-085)

## 1. O PDF SPICA como contrato de saída

Arquivo de referência: `/home/marce/Downloads/spica_h020_l_orcamento_p luiz carlos de almeida.pdf` (relatório `H020_L_Orcamento_P`, paisagem).

Campos extraídos (2026-09-21):

| Zona | Conteúdo no exemplo |
|---|---|
| Timbre | QL MED MATERIAIS HOSPITALARES LTDA; CNPJ 07.832.309/0001-97; IE 28.337.918-9; Rua Dr. Salomão Nahas, 44 — Cachoeira II — Campo Grande/MS; (67) 3326-3520; qlta@uol.com.br |
| Meta | Data 15/09/2026, Pag. 1 |
| Título | ORÇAMENTO |
| Cabeçalho do doc | No. 00008318; Data; Cliente INSTITUTO DE ASSISTENCIA…; Cód. 00571 |
| Endereço | Avenida das Flores, 941, Jardim Cuiabá, Cuiabá/MT, 78043-172 |
| Fiscal cliente | CNPJ 05.794.356/0001-68; IE ISENTO; Vendedor (em branco) |
| Colunas | Ítem, Código, Descrição, R.V.S., NCM, Un., Qtde., Pr. Un., Desc., Total |
| Item | 001 / 4326202 / KIT AUTOTRANSFUSÃO X-TRA 225 / 80102511537 / 90183929 / UN / 1 / 3.800,00 / (vazio) / 3.800,00 |
| Totais | Sub-Total 3.800,00; Frete 0,00; Total 3.800,00 |
| Clínico | Paciente LUIZ CARLOS DE ALMEIDA; Médico Paulo Ruiz; Convênio MT SAUDE - 007; Local AMECOR… |
| Obs | dados de conta corrente Banco do Brasil |
| Fecho | Atenciosamente + Flavio / Daniele / Marcelo |

O rodapé `SPICA … www.joinner.com.br` **não** entra no QLMED.

## 2. O que o QLMED já tem

- **Clientes**: agregados de NF-e emitida (`handleContactList`), ficha `ContactFiscal` (IE, UF, cidade), `ContactOverride` (endereço/fone/e-mail). A Saída Material já busca destinatários; o orçamento precisa também do endereço para o PDF, então a resolução é um snapshot próprio em `/api/orcamentos/clientes`.
- **Produtos**: `ProductRegistry` com código Spica (`codigo`/`code`), NCM, ANVISA (`anvisaCode` = R.V.S.), unidade, `outOfLine`, `aggLastSalePrice` / `aggLastPrice`. SPEC-079 já trata “em linha” como filtro padrão.
- **PDF**: `renderHtmlToPdf` (puppeteer-core, JS/rede cortados) usado no DANFE. Reuso obrigatório; HTML autocontido.
- **Dinheiro**: `src/lib/money.ts` Decimal ROUND_HALF_UP. Constituição e SPEC-004/082 proíbem float como verdade.
- **Sidebar**: três fontes (`PAGE_GROUPS`, `PAGE_LABELS`, `buildNavItems`). SPEC-042 já pinou Documentos no topo; o teste `sidebar-nav-paths` quebra se as listas divergirem. Orçamentos entra **no mesmo grupo sem seção**, antes de Documentos.
- **ACL**: default-deny. Página nova não pode herdar `/api/products` (mutações de catálogo).

## 3. Como a página deve ser

Fluxo em duas telas, no idioma e chrome do painel:

1. **Lista** (`/orcamentos`)
   - PageHeader com ícone `contract`, título Orçamentos, botão Novo.
   - Busca por número ou nome/CNPJ do cliente; chips de situação (todos / rascunho / emitido / cancelado).
   - Tabela densa (padrão Documentos/Saída): número formatado, data pt-BR, cliente, total `formatCurrency`, Badge de situação, RowActions (abrir, PDF, duplicar, cancelar).
   - EmptyState se não houver nenhum.

2. **Editor** (`/orcamentos/novo` e `/{id}`)
   - Topo: número (se já salvo), data, situação, ações (Salvar, PDF, Duplicar, Cancelar).
   - **Cliente**: input de busca que lista razão + CNPJ; ao escolher, mostra endereço e IE em texto (somente leitura do snapshot, com botão “trocar”).
   - **Clínico** em uma faixa: Paciente, Médico, Convênio, Local, Vendedor — são os campos que diferenciam o orçamento hospitalar da NF-e.
   - **Itens**: typeahead de produto (em linha); ao confirmar, adiciona linha editável. Colunas espelham o PDF. Totais à direita, sticky no desktop.
   - **Frete + observação** embaixo. Observação pode nascer vazia; o operador cola dados bancários se quiser (não forçar a conta do exemplo).
   - Validação visível nos campos; gravar desabilitado para `viewer`.

Não é wizard. Não é popup único: a lista precisa existir para reimpressão. Não misturar com Saída Material (aquilo escolhe lote/estoque; isto é preço e papel).

## 4. Decisões locais (não ADR)

| Tema | Escolha | Alternativa rejeitada |
|---|---|---|
| Path | `/orcamentos` top-level | `/cadastro/orcamentos` — não é cadastro |
| Número | sequencial por empresa, 8 dígitos | reusar numeração SPICA — não temos a série |
| Código cliente SPICA | omitir se desconhecido | inventar hash do CNPJ — mentiria no papel |
| Busca produto/cliente | rotas sob `/api/orcamentos` | reusar `/api/products` — abriria mutação de catálogo |
| Situação issued | ao gerar PDF a primeira vez | ao primeiro save — rascunho precisa existir |
| Timbre | Company + fallback QL MED do exemplo | exigir cadastro completo de endereço da empresa — hoje não há campos suficientes |

## 5. Riscos

- `useRole().hasPageAccess` no cliente ainda trata lista vazia como “tudo” (legado). A autorização real é o middleware + `requireEditor`. Não “corrigir” isso nesta feature.
- Preview precisa do Chromium (`PUPPETEER_EXECUTABLE_PATH`) para o PDF; a listagem/edição não.
- Operadores com `allowedPages` explícita não verão Orçamentos até o admin marcar a página.
