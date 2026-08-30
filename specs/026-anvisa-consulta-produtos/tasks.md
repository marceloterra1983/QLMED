# Tasks: Consulta ANVISA a partir de Produtos

**Input**: [spec.md](./spec.md) / [plan.md](./plan.md)

## Phase 1 — Navegação

- [x] T001 Remover `/cadastro/anvisa` de `PAGE_GROUPS` e remapear
      `/api/anvisa` para `/cadastro/produtos` em `src/lib/navigation.ts`
- [x] T002 Remover o item ANVISA de `src/components/SidebarNav.tsx`
- [x] T003 Testes ACL em `src/lib/__tests__/navigation.test.ts`

## Phase 2 — Botão em Produtos

- [x] T004 Constante `ANVISA_PRODUTOS_SAUDE_URL` em `src/lib/anvisa-consulta.ts`
- [x] T005 Botão no cabeçalho de
      `src/app/(painel)/cadastro/produtos/page-client.tsx`
- [x] T006 Teste da URL em `src/lib/__tests__/anvisa-consulta.test.ts`
