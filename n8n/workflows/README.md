# Workflows n8n QLMED

## Fonte de verdade (produção)

- Snapshot git diário: `~/server-ops/shared/ops/n8n/qlmed-workflows-snapshot/`
- Instância: https://n8n.qlmed.com.br/ (container `qlmed-n8n`)
- Promoção staging→prod: `~/server-ops/shared/ops/scripts/n8n-promote.sh`

## Workflows versionados neste diretório

| Arquivo | ID | Função |
|---------|----|--------|
| `qlmedCiLoop01.json` | `qlmedCiLoop01` | Segunda 07:30: CI Loop (scorecard + PR patches seguros + issue). |
| `speckitDailyUpdate01.json` | `speckitDailyUpdate01` | Todo dia 07:00 (Campo Grande): chama listener host `:18644` para atualizar Spec Kit CLI e abrir PR se o projeto estiver atrás. Notifica WhatsApp só em drift/PR/erro. |

### Ativar CI Loop (melhoria contínua)

1. `systemctl --user enable --now qlmed-ci-loop-listener.service` (:18645)
2. `CI_LOOP_TOKEN` em `env/n8n.env` (já provisionado no host)
3. Workflow `qlmedCiLoop01` — política em `.ci-loop/policy.json`, docs em `docs/continuous-improvement.md`

### Ativar Spec Kit Daily Update

1. Listener no host (systemd user):
   ```bash
   systemctl --user daemon-reload
   systemctl --user enable --now qlmed-speckit-update-listener.service
   curl -sS http://127.0.0.1:18644/health
   ```
2. Token em `~/server-ops/qlmed/ops/secrets/speckit-update.token` — exportar no `env/n8n.env`:
   ```bash
   SPECKIT_UPDATE_TOKEN=$(cat ~/server-ops/qlmed/ops/secrets/speckit-update.token)
   ```
   Reiniciar `qlmed-n8n` após incluir a variável.
3. Importar (staging preferível) e promover:
   ```bash
   docker cp ~/qlmed/n8n/workflows/speckitDailyUpdate01.json qlmed-n8n:/tmp/
   docker exec qlmed-n8n n8n import:workflow --input=/tmp/speckitDailyUpdate01.json
   # Ativar na UI e publicar versão (n8n 2.x exige activeVersionId)
   ```
4. Teste manual na UI → Execute workflow.

## Arquivo histórico

Cópias dos JSONs antigos (obsoletos):
`../workflows-archived-obsolete-20260717/`
