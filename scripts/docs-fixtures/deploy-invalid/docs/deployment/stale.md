# Fixture inválida — doc de deploy que ensina caminho inexistente

Controlo positivo da regra QLMED-DOC-001 em `scripts/validate-docs.mjs`.
Se este ficheiro PASSAR na validação, a regra ficou vacuosa.

Contém os dois defeitos reais que a auditoria b177b07 encontrou em
`docs/deployment/qlmed-app.md`:

Deploy por evento: push na `main` → `QLMED CI` → `workflow_run` dispara o
deploy de produção.

```bash
cd /home/marce/qlmed/app
npm run db:push
```
