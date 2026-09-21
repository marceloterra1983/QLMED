# Quickstart: Orçamentos

1. Conceder `/orcamentos` no picker de Usuários (admin já vê).
2. Abrir **Orçamentos** no topo do sidebar (acima de Documentos).
3. Novo orçamento → buscar cliente pelo nome ou CNPJ → buscar produto em linha → quantidade e preço → paciente/convênio se houver → Salvar → Gerar PDF.
4. Reabrir pela lista para reimprimir. Duplicar para um caso parecido. Cancelar se o pedido morreu.

Dev: worktree `feat/085-orcamentos`. Preview canónico `:3002` com `QLMED_PREVIEW_CWD` nesta worktree. PDF exige `PUPPETEER_EXECUTABLE_PATH`.
