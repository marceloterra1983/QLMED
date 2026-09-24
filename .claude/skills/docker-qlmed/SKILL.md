---
name: docker-qlmed
description: Docker stack management for QLMED — rebuild, logs, restart, health, rollback commands
---

# Docker QLMED Stack Management

## When to activate
Activate when the user asks about Docker containers, stack management, rebuilding services, viewing logs, or troubleshooting container issues.

## Stack architecture

The QLMED stack runs on vps2 from `/srv/qlmed/docker-compose.yml`. Publication is local: `npm run verify:release <SHA>`, then `npm run deploy:local -- DEPLOY <SHA> --publish`. GitHub is backup only.

| Service | Container name | Port |
|---|---|---|
| App (Next.js) | `qlmed-app` | 13000→3000 |
| DB (PostgreSQL 18) | `qlmed-db` | 127.0.0.1:5432 |
| n8n | `qlmed-n8n` | 5678 |
| Evolution API | `qlmed-evolution-api` | 8085→8080 |
| Evolution DB | `qlmed-evolution-db` | internal |
| Evolution Redis | `qlmed-evolution-redis` | internal |

## Important notes

- `/srv/qlmed` on vps2 is the runtime. On this dev host, `~/qlmed/production` is the builder staging directory.
- Do not rebuild production from this host with `docker compose up --build`. That bypasses the receipt.
- Use `docker compose --project-name qlmed --env-file /srv/qlmed/.env -f /srv/qlmed/docker-compose.yml` for read-only inspection and authorized recovery.

## Common commands

### View logs
```bash
docker logs -f --tail 100 qlmed-app
```

### Restart a service
```bash
docker restart qlmed-app
```

### Health checks
```bash
curl http://127.0.0.1:13000/api/health  # App
curl http://127.0.0.1:5678              # n8n
curl http://127.0.0.1:8085              # Evolution
```

### DB access
```bash
docker exec -it qlmed-db psql -U postgres -d postgres
```

### Publish a verified revision
```bash
cd ~/qlmed/app
npm run verify:release <FULL_40_CHAR_SHA>
npm run deploy:local -- DEPLOY <FULL_40_CHAR_SHA> --publish
```

### Check disk/resources
```bash
docker system df          # Disk usage
docker stats --no-stream  # CPU/Memory per container
```

## Troubleshooting
- Container in restart loop → check `docker logs <name>` for error
- DB not reachable → inspect `qlmed-db` health and the `qlmed_internal` network
- Port conflict → check `ss -tlnp | grep <port>`
- Out of disk → `docker system prune` (careful with volumes)
