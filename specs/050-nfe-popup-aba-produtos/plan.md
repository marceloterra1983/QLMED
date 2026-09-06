# Plan: SPEC-050 — Popup de NF-e abre na aba Produtos

## Approach

1. Default de `NfeDetailsModal`: `useState('produtos')` e `setActiveTab(initialTab || 'produtos')`.
2. `openDetails` em `invoices/page-client.tsx` e `issued/page-client.tsx` passa `setDetailsInitialTab('produtos')`.
3. Atualizar `NfeDetailsModal.tabs.test.tsx` para assertar a aba Produtos selecionada.

## Constitution check

Sem mudança de auth, schema, API ou isolamento. Só UX de aba inicial.

## Test strategy

Vitest estático do tablist (já existente) + asserts da label Produtos selecionada.
