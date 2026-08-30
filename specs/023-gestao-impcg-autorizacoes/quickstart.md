# Quickstart: SPEC-023

Validação local. Sem imprimir `.env`. Dev sobe em `:3000` com
background off.

## Pré-requisitos

- Worktree `feat/gestao-impcg-autorizacoes`
- `nvm use 22`
- Banco canônico (`DATABASE_URL`). Não criar `qlmed_dev`
- Migration desta feature aplicada no ambiente de teste
- RBAC Exchange nas duas caixas (senão a coleta falha de forma
  explícita e a lista ainda funciona com seed/fixture)
- OneDrive `faturamento@qlmed.com.br` conectado no painel
- Usuário com `/gestao/impcg` em `allowedPages` (ou admin)

## Checks do repositório

```bash
npm run docs:validate
npx tsc --noEmit
npm run lint
npm test
npm run db:migrate:verify
npm run db:reconcile:verify
```

Esperado: parser 17673 com total `12550.00` e três linhas;
dedup Message-ID e nº; upload mock falho sem upsert; ACL 403.

## Tela

1. Login no painel (`http://127.0.0.1:3000`).
2. **Gestão → IMPCG**. Lista ordenada; vazio = “Nenhuma autorização IMPCG.”
3. Abrir uma linha: popup `Ordem {n} — {paciente}`, itens, PDF.
   Esc e voltar fecham.
4. Viewer não vê “Atualizar agora”. Editor dispara; o cabeçalho
   mostra a última coleta.

## Coleta

```bash
# editor/admin autenticado (cookie de sessão)
curl -sS -X POST http://127.0.0.1:3000/api/gestao/impcg/sync
```

Uma caixa 403: a outra ainda processa. Sem Graph: `lastError`
sanitizado; linhas antigas intactas.

## Fora deste guia

Consentimento Entra org-wide, outros clientes, edição manual,
financeiro a partir do ofício.
