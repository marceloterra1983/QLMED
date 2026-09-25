### Preview DEV canônico (Tailscale) — obrigatório antes de merge/deploy de UI

Worktree permanente: `/home/marce/qlmed/.worktrees/preview`  
URL: `http://100.68.84.119:3002`  
Unit: `systemctl --user start qlmed-dev-preview`  
Starter: `ops/scripts/qlmed-dev-preview-starter.mjs`  
(`QLMED_PREVIEW_CWD` opcional para apontar a uma worktree de feature.)

`npm run dev` no bash do Cursor morre com o agente. **Não** suba outro Next.
**Única porta de preview = 3002.** Proibido 3003/3004. Feature com UI:
checkout/rebase do tip **nessa** worktree (ou override do `cwd` do starter),
smoke em `:3002`, **depois** merge no `main` local e `git push` de backup.

- `NEXTAUTH_URL` (obrigatória em `src/lib/env.ts`): preview HTTP exige
  `http://100.68.84.119:3002`. Herdar `https://app.qlmed.com.br` → cookie
  `Secure`/`__Host-` → CSRF drop → catch do `signIn` = “Erro ao fazer login”.
  Senha errada é outra mensagem (“Senha inválida”).
- `DATABASE_URL`: túnel `127.0.0.1:5435` (writer vps2). Dump `:5434` o starter
  recusa. Workers de fundo desligados (`QLMED_DISABLE_BACKGROUND_SERVICES`).
- Diagnóstico refused: `ss` sem listen = processo morto (`systemctl --user
  restart qlmed-dev-preview`). Curl local 200/307 + Windows refused =
  Tailscale/browser (IPv6: Next pode não ouvir `[::]`).
- Policy Cursor: `.cursor/rules/dev-preview-persistente.mdc` e
  `always-deploy-production.mdc` (alwaysApply).
