# Plan: SPEC-029 Cabeçalho fixo do painel

**Branch**: `fix/page-sticky-header`
**Constitution**: `.specify/memory/constitution.md` v1.0.2 — lida.
Sem schema, sem API, sem segredo. Evidência: contrato de fonte + typecheck/lint/test + `docs:validate`.

## Complexity Tracking

Nenhuma exceção. Alternativa mais simples rejeitada: CSS `:first-child` no
layout — quebra em páginas cujo primeiro filho é um wrapper da tela inteira
(NFS-e, Impostos, Financeiro).

## Implementation

1. Extrair o bloco visual de NF-e Emitidas para `PageHeader` (sticky, fundo
   opaco, z-index acima da tabela).
2. Mover o padding do scroller do layout para o wrapper interno, para o
   chrome poder sangrar até a borda da coluna.
3. Trocar os cabeçalhos existentes das listas pelo componente.
4. Remover `overflow: hidden` na raiz de Financeiro (prende sticky).
5. Não tocar `issued/nova` nem `nfe-emission`.
