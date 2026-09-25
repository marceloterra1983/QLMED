### Infra notes específicas do host atual

- Runner self-hosted com label `qlmed-prod`, roda como serviço systemd.
- Container entrypoint (`start.sh`): valida `DATABASE_URL`, roda
  `prisma migrate deploy`, depois inicia `node server.js`.
- Node 22 via nvm no host (dev); imagem Alpine (produção). Puppeteer com
  Chromium do sistema para geração de PDF.
- Acesso de dev via Tailscale: `http://100.68.84.119:3000` (main); preview
  canônico **só** `http://100.68.84.119:3002` (`.worktrees/preview`) —
  ver Preview DEV canônico.
- `nvm` obrigatório: `export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh" && nvm use 22`
- `n8n` `$env` expressions (`{{ $env.QLMED_API_URL }}` etc.): versões recentes do
  n8n têm `N8N_BLOCK_ENV_ACCESS_IN_NODE=true` por padrão, o que falha toda
  execução com `ExpressionError: access to env vars denied` sem aviso claro.
  `env/n8n.env` de produção seta `N8N_BLOCK_ENV_ACCESS_IN_NODE=false`.
- `qlmed-app`, `qlmed-db`, `qlmed-n8n`, `qlmed-n8n-db` compartilham o projeto
  `qlmed` de `/srv/qlmed/docker-compose.yml`. A Evolution do QLMED é um projeto
  separado em `/srv/qlmed/evolution/`.
- Acesso Postgres via host (`127.0.0.1:5432`): se a porta falhar, diagnóstico
  não-mutante apenas (não recriar proxies legados):
  ```bash
  docker compose --project-name qlmed -f /srv/qlmed/docker-compose.yml ps qlmed-db
  docker logs qlmed-db --tail 50
  ```
