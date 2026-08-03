---
name: docker-qlmed
description: Docker stack management for QLMED — rebuild, logs, restart, health, rollback commands
---

# Docker QLMED Stack Management

## When to activate
Activate when the user asks about Docker containers, stack management, rebuilding services, viewing logs, or troubleshooting container issues.

## Stack architecture

The QLMED stack is managed by Docker Compose from `/srv/qlmed/docker-compose.yml`. GitHub Actions is the production deployment controller.

| Service | Container name | Port |
|---|---|---|
| App (Next.js) | `qlmed-app` | 13000→3000 |
| DB (PostgreSQL 18) | `qlmed-db` | 127.0.0.1:5432 |
| n8n | `qlmed-n8n` | 5678 |
| Evolution API | `qlmed-evolution-api` | 8085→8080 |
| Evolution DB | `qlmed-evolution-db` | internal |
| Evolution Redis | `qlmed-evolution-redis` | internal |

## Important notes

- `/srv/qlmed` is the canonical runtime; `~/qlmed/production` is its compatibility alias.
- Production changes go through the GitHub Actions deployment workflow.
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

### Rebuild via GitHub Actions deploy
```bash
cd /srv/qlmed
docker compose --project-name qlmed --env-file .env up -d --build qlmed-app
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
