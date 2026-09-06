# Aposentadoria host qlmed-n8n (2026-09-06)

- Containers `qlmed-n8n` / `qlmed-n8n-db` removidos.
- Volumes `qlmed_n8n_data` / `qlmed_n8n_pgdata` removidos após backup.
- Env `/srv/qlmed/env/n8n*.env` arquivados no backup e removidos do live.
- Stack genérico `n8n` + `n8n-postgres` (`/srv/n8n`) **não** tocado.
- Backup: `/srv/qlmed/ops/backups/n8n-retire-20260906T154643Z/`
