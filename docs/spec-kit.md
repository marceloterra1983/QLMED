# Spec Kit operations

QLMED uses Spec Kit `0.14.2` no **projeto** (`.specify/`, pin em
`init-options.json`). Instalação/upgrade do CLI:

```bash
uv tool install specify-cli --force \
  --from git+https://github.com/github/spec-kit.git@v0.14.2
specify --version
```

O CLI no host pode estar à frente do pin do projeto. O updater diário mantém o
CLI atual, mas não altera automaticamente a integração versionada do projeto;
esse upgrade continua sujeito à política manual abaixo. Cursor e CI obrigam o
uso do pin atual: [ADR-0009](./decisions/0009-ai-tooling-auto-refresh.md),
`npm run ai-tooling:check`, rules em `.cursor/rules/` e skills em
`.cursor/skills/speckit-*`.

The project uses the `codex` integration in skills mode. Configuration and
installed skills are committed under `.specify/` and `.agents/skills/`.

## Host SDD (runtime specs)

Specs operacionais do host (n8n, qlmed-app, networking, etc.) vivem no checkout
canônico `/home/marce/specs`. Comece por `INDEX.md`. Spec Kit neste repo cobre
features do app; SDD cobre a stack do servidor. Não duplicar conteúdo entre os
dois.

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

Fluxo: **n8n Shared (container `n8n`) Schedule 07:00** → HTTP
`host.docker.internal:8765/speckit/update` → serviço host → WhatsApp (só se
houver atualização ou erro). A cópia que existia no n8n QLMED foi removida em
31/07/2026 para impedir execução duplicada.

| Peça | Path |
|------|------|
| Workflow | `~/ops/n8n/workflows-snapshot/SpecKitAutoUpd01.json` (id `SpecKitAutoUpd01`, n8n Shared) |
| Script | `~/qlmed/ops/scripts/speckit-updater.py` |
| Segredo | `/etc/qlmed/speckit-updater.env` → env `SPECKIT_WEBHOOK_SECRET` no serviço e no n8n Shared |
| systemd | `/etc/systemd/system/speckit-updater.service` (porta 8765) |

Comportamento do serviço:

1. Compara a versão do CLI no host com a latest release de `github/spec-kit`.
2. Em `mode=apply`, atualiza somente o ambiente isolado do CLI em
   `~/.local/share/specify-cli` quando houver versão nova.
3. A constituição, os templates e o pin do projeto não são alterados pelo
   workflow. Um upgrade da integração exige branch descartável, validação e PR
   conforme a política acima.
4. O endpoint exige `X-Webhook-Secret`, limita o corpo a 4 KiB e serializa
   atualizações concorrentes.

Check manual (sem efeitos):

```bash
systemctl status speckit-updater.service --no-pager
curl -fsS http://127.0.0.1:8765/healthz
```

Validação local de docs do app:

```bash
npm run docs:validate
npm run docs:validate:test
npm run ai-tooling:check
npm run ai-tooling:check:test
```

O workflow semanal `.github/workflows/ai-tooling-drift.yml` compara o pin e o
CLI Graphify com o latest público e abre ou atualiza a issue `[ai-tooling-drift]`.
Ele não altera constituição, templates nem o pin.
