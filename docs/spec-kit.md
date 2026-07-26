# Spec Kit operations

QLMED uses Spec Kit `0.12.11` no **projeto** (`.specify/`), instalado originalmente de:

```bash
uv tool install specify-cli --force \
  --from git+https://github.com/github/spec-kit.git@v0.12.11
specify --version
```

O CLI no host pode estar à frente do pin do projeto — isso é esperado até o PR
diário de upgrade ser revisado e mergeado.

The project uses the `codex` integration in skills mode. Configuration and
installed skills are committed under `.specify/` and `.agents/skills/`.

## Upgrade policy

The constitution and the spec, plan and task templates are intentionally
customized. Therefore `specify integration status` reports modified managed
files. Before upgrading:

1. read the release notes;
2. perform the upgrade on a disposable branch;
3. compare constitution and templates;
4. preserve QLMED-specific IDs, security, ownership and verification rules;
5. run `npm run docs:validate` and the pilot smoke checks.

Never run a forced integration upgrade directly on `main`.

## Atualização automática diária (n8n)

Fluxo: **n8n Schedule 07:00 (America/Campo_Grande)** → HTTP
`host.docker.internal:18644/run` → script host → WhatsApp (só se houver
drift/PR/erro).

| Peça | Path |
|------|------|
| Workflow | `n8n/workflows/speckitDailyUpdate01.json` (id `speckitDailyUpdate01`) |
| Script | `~/qlmed/ops/scripts/qlmed-speckit-daily-update.sh` |
| Listener | `~/qlmed/ops/scripts/qlmed-speckit-update-listener.py` (:18644) |
| Token | `~/qlmed/ops/secrets/speckit-update.token` → env `SPECKIT_UPDATE_TOKEN` no n8n |
| systemd | `~/.config/systemd/user/qlmed-speckit-update-listener.service` |

Comportamento do script (`--mode update`):

1. Compara CLI local e pin do projeto (`.specify/init-options.json`) com a
   latest release de `github/spec-kit`.
2. Se o CLI estiver atrás → `specify self upgrade` no host.
3. Se o **projeto** estiver atrás → cria branch `chore/speckit-upgrade-vX.Y.Z`
   a partir de `main`, roda `specify integration upgrade --force` **somente na
   branch**, abre PR e notifica. Não mergeia.
4. Se já existir PR aberta para a mesma tag → reusa e notifica o link.

Check manual (sem efeitos):

```bash
~/qlmed/ops/scripts/qlmed-speckit-daily-update.sh --mode check --json
curl -sS -H "X-Speckit-Token: $(cat ~/qlmed/ops/secrets/speckit-update.token)" \
  -X POST http://127.0.0.1:18644/check
```
