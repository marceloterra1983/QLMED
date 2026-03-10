# QLMED

Modelo operacional do projeto:

- `dev` fica no computador `dev`
- `prod` fica no computador `server`
- `n8n` existe em `dev` e em `prod`
- `Evolution` fica somente em `prod`

## Desenvolvimento

- `n8n dev`: `http://100.123.233.116:5678/`
- `app dev`: `http://100.123.233.116:3001/`
- `Evolution usado pelo dev`: `https://evolution.qlmed.com.br`

## Regras

- o `n8n dev` nao deve ter cron ou webhook real ativo
- o `n8n prod` e o unico dono dos gatilhos reais
- o `n8n dev` deve testar integracoes com `Manual Trigger`
- a chave do `Evolution` de producao nao deve ficar versionada no repositorio
- o ideal e cadastrar a credencial do `Evolution` direto no `n8n dev`

## Variaveis uteis no n8n dev

- `QLMED_DEV_MODE=true`
- `QLMED_ALLOW_REAL_EXECUTIONS=false`
- `QLMED_EVOLUTION_BASE_URL=https://evolution.qlmed.com.br`
