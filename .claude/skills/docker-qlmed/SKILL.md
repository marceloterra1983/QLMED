---
name: docker-qlmed
description: Docker stack management for QLMED — rebuild, logs, restart, health, rollback commands
---

# Docker QLMED Stack Management

## When to activate
Activate when the user asks about Docker containers, stack management, rebuilding services, viewing logs, or troubleshooting container issues.

## Stack architecture

The QLMED stack is managed by **Coolify** (not docker-compose directly). Container names have Coolify suffixes.

| Service | Container pattern | Port |
|---|---|---|
| App (Next.js) | `qlmed-app-*` | 13000→3000 |
| DB (PostgreSQL 18) | `qlmed-db-*` | internal only |
| n8n | `qlmed-n8n-*` | 5678 |
| Evolution API | `qlmed-evolution-api-*` | 8085→8080 |
| Evolution DB | `qlmed-evolution-db-*` | internal |
| Evolution Redis | `qlmed-evolution-redis-*` | internal |
| DB Proxy (socat) | `qlmed-db-proxy` | 127.0.0.1:5432 |

## Important notes

- **Coolify manages the stack** — container names include random suffixes like `lkwc0s0ck8kcckocc4goc0kg-*`
- The `docker-compose.yml` at `~/QLMED/production/` is used by GitHub Actions deploy, NOT by Coolify
- Do NOT create containers named `qlmed-db` or `qlmed-app` directly — they conflict with Coolify containers
- The `qlmed-db-proxy` container is the ONLY non-Coolify container; it forwards `localhost:5432` to the Coolify DB

## Common commands

### View logs
```bash
# Find actual container name first
docker ps --format "{{.Names}}" | grep qlmed-app
# Then tail logs
docker logs -f --tail 100 <container-name>
```

### Restart a service
```bash
docker restart <container-name>
```

### Health checks
```bash
curl http://127.0.0.1:13000/api/health  # App
curl http://127.0.0.1:5678              # n8n
curl http://127.0.0.1:8085              # Evolution
```

### DB access
```bash
# Via proxy (from host)
docker exec -it qlmed-db-proxy sh -c "apk add postgresql-client && psql postgresql://postgres:PASSWORD@qlmed-db-SUFFIX:5432/postgres"

# Or directly into the DB container
docker exec -it <qlmed-db-container> psql -U postgres
```

### Rebuild via GitHub Actions deploy
```bash
cd ~/QLMED/production
docker compose --project-name qlmed --env-file .env up -d --build qlmed-app
```

### Check disk/resources
```bash
docker system df          # Disk usage
docker stats --no-stream  # CPU/Memory per container
```

## Troubleshooting
- Container in restart loop → check `docker logs <name>` for error
- DB not reachable → verify `qlmed-db-proxy` is running
- Port conflict → check `ss -tlnp | grep <port>`
- Out of disk → `docker system prune` (careful with volumes)
