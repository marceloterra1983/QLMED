---
name: deploy-check
description: Pre-deploy validation — health checks, commit comparison, container status, production readiness
disable-model-invocation: true
---

# Deploy Check

## When to activate
Activate when the user asks to check deploy status, verify production health, compare dev vs production, or prepare for deployment.

## Validation steps

### 1. Git status
- Verify `~/QLMED/dev/` has no uncommitted changes
- Check current branch is `main`
- Compare local HEAD with `origin/main`

### 2. Production health
```bash
# App health
curl -s http://127.0.0.1:13000/api/health | jq .

# Public endpoint
curl -s -o /dev/null -w "%{http_code}" https://app.qlmed.com.br/

# n8n
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:5678

# Evolution API
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8085
```

### 3. Container status
```bash
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | grep -E "qlmed|evolution"
```

### 4. Compare commits
- Read `~/QLMED/production/app/.deploy-meta.env` for `QLMED_BUILD_COMMIT_SHA`
- Compare with `git rev-parse HEAD` in `~/QLMED/dev/`
- Show diff summary if they differ

### 5. DB proxy check
```bash
# Verify socat proxy is running
docker ps | grep qlmed-db-proxy
# Test DB connectivity
timeout 3 bash -c 'echo > /dev/tcp/127.0.0.1/5432' && echo "DB OK"
```

### 6. Dev server check
```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/api/health
```

## Output format
Present results as a checklist table with status indicators.
