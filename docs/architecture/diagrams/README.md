# Diagramas QLMED (draw.io)

Fluxogramas da arquitetura do sistema QLMED (gestão fiscal NF-e/CT-e/NFS-e) e da stack no host `server`.

Fontes: SDD (`/home/marce/sdd-specs/server/…`), `docker-compose.yml`,
`qlmed-app.spec.md`, stack-overview.

## Ferramenta

- draw.io Desktop no host: `drawio` (v31.0.2)
- Abrir: `drawio <arquivo.drawio>` ou https://app.diagrams.net
- Exportar headless:
  ```bash
  xvfb-run -a drawio --export --format png --scale 2 --border 20 -o out.png file.drawio
  ```

## Arquivos

| # | Arquivo | Conteúdo |
|---|---|---|
| 01 | `ingress-overview` | Cloudflare Tunnel único (QLMED + Charlie) |
| 03 | `app-modules` | Next.js painel, API, lib, Prisma |
| 04 | `external-integrations` | SEFAZ, NSDocs, Receita, ANVISA, OneDrive, Evolution, n8n |
| 05 | `deploy-pipeline` | CI → aprovação → runner → health/rollback |
| 06 | `dev-prod-data` | `DATABASE_URL` único, PostgreSQL canônico, CI efêmero e receipt do backup `qlmed` |
| 07 | `invoice-sync` | NF-e / CT-e DistDFe / NFS-e → ingest |
| 08 | `notifications-whatsapp` | Outbox + worker + Evolution + n8n |
| 09 | `backup-retention` | pg_dump local + GDrive |
| 10 | `domain-model` | Modelos Prisma simplificados |

## Legenda de cores

- **Verde**: produção QLMED / caminho feliz
- **Azul**: infraestrutura / componentes gerais
- **Laranja**: Windows-like / ops / timers / Host paths
- **Amarelo**: atenção / dev / Cloudflare edge
- **Roxo**: WhatsApp / automação / Charlie-adjacent
- **Vermelho**: risco / aprovação / rollback
- **Cinza**: deferred / histórico

*Diagramas descrevem o AS-IS documentado; validar com specs SDD se divergirem.*

As fontes `.drawio` são canônicas. Os SVGs exportados são derivados e devem ser
regenerados com draw.io quando a ferramenta estiver disponível; não use um SVG
antigo como evidência de um segundo banco persistente.
