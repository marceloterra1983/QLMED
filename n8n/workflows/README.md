# Workflows n8n QLMED

## Fonte de verdade (produção)

- Snapshot git diário: `~/ops/n8n/qlmed-workflows-snapshot/`
- Instância: https://n8n.qlmed.com.br/ (container `qlmed-n8n`)
- Promoção staging→prod: `~/ops/scripts/n8n-promote.sh`

O snapshot atualmente contém apenas `dailysummaryissued01.json` e
`qlmedGlobalErr01.json`. As cópias `qlmedCiLoop01.json` e
`speckitDailyUpdate01.json` abaixo são fontes históricas/inativas no QLMED; o
workflow ativo de Spec Kit está no n8n Shared (`~/ops/n8n/workflows-snapshot/`).

## Workflows versionados neste diretório

| Arquivo | ID | Função |
|---------|----|--------|
| `qlmedCiLoop01.json` | `qlmedCiLoop01` | Fonte histórica/inativa do CI Loop de segunda 07:30; listener `:18645` não está implantado. |
| `speckitDailyUpdate01.json` | `speckitDailyUpdate01` | Fonte histórica/inativa da integração QLMED; o fluxo ativo equivalente é `SpecKitAutoUpd01` no n8n Shared e usa o bridge `:8765`. |

### CI Loop (diferido; não ativar)

O listener `qlmed-ci-loop-listener.service` e a porta `:18645` não existem no
host verificado em 2026-08-03. A política e o workflow permanecem versionados
para uma eventual reimplantação, que exige decisão e nova validação.

### Spec Kit Daily Update (operado no n8n Shared)

O workflow ativo é `SpecKitAutoUpd01` no n8n Shared. O bridge host é o serviço
`speckit-updater.service` (systemd do sistema), script em
`~/ops/qlmed/ops/scripts/speckit-updater.py`, porta `127.0.0.1:8765`.
Validação read-only:

```bash
systemctl status speckit-updater.service --no-pager
curl -fsS http://127.0.0.1:8765/healthz
```

