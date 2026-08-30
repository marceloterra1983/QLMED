# Quickstart: SPEC-024

Validação local. Sem imprimir `.env`. Dev sobe em `:3000` com
background off.

## Pré-requisitos

- Worktree `feat/gestao-cassems-autorizacoes`
- Banco canônico (`DATABASE_URL`). Não criar `qlmed_dev`
- Migration desta feature aplicada no ambiente de teste
- OneDrive `faturamento@qlmed.com.br` conectado; pasta
  `1 - DOCUMENTOS/0 - AUTORIZACOES/CASSEMS` com o PDF modelo
- RBAC Exchange em `joseroberto@qlmed.com.br` (senão FAIL-001;
  a pasta ainda importa)
- Usuário com `/gestao/cassems` em `allowedPages` (ou admin)

## Checks do repositório

```bash
npm run docs:validate
npx tsc --noEmit
npm run lint
npm test
npm run db:migrate:verify
npm run db:reconcile:verify
```

Esperado: parser 2479325231 com total `4760.00` e duas linhas;
dedup Message-ID e nº; upload mock falho sem upsert; ACL 403;
folder scan do modelo ⇒ 1 linha.

## Tela

1. Login no painel (`http://127.0.0.1:3000`).
2. **Gestão → CASSEMS**. Lista ordenada; vazio = “Nenhuma autorização CASSEMS.”
3. Abrir uma linha: popup `Autorização {n} — {paciente}`, itens, PDF.
4. Viewer não vê “Atualizar agora”. Editor dispara; o cabeçalho
   mostra a última coleta.

## Coleta

```bash
curl -sS -X POST http://127.0.0.1:3000/api/gestao/cassems/sync
```

Caixa 403: a pasta ainda processa. Sem Graph: `lastError`
sanitizado; linhas antigas intactas.

## Fora deste guia

Deploy, secrets e tokens.
