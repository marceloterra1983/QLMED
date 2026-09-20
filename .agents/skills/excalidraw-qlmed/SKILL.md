---
name: excalidraw-qlmed
description: QLMED overlay for Excalidraw. Use whenever the user or agent draws, edits, exports, imports, screenshots, or discusses Excalidraw, .excalidraw files, live canvas, architecture diagrams as drawings, Mermaid-to-Excalidraw, or mcp-excalidraw-server. Read this BEFORE the vendor excalidraw-skill — it overrides the default canvas port so Next.js :3000 and preview :3002 stay free.
---

# Excalidraw no QLMED

Vendor skill (workflow de desenho, qualidade, CLI/MCP): `.agents/skills/excalidraw-skill/SKILL.md`.

This overlay **wins on host/port**. The vendor docs default to `:3000`. That port is the canonical Next.js app in this repo. Using it kills or blocks `npm run dev`.

## Canvas canônico

| O quê | Valor |
|---|---|
| URL | `http://127.0.0.1:3456` |
| Bind | `HOST=127.0.0.1` `PORT=3456` |
| MCP | servidor `excalidraw` em `.cursor/mcp.json` |
| Pacote | `mcp-excalidraw-server@2.0.0` |

**Proibido:** `3000`, `3001`, `3002`, `3003`, `3004`. Não suba outro Next. Não exponha `HOST=0.0.0.0`.

Antes de **qualquer** CLI:

```bash
export HOST=127.0.0.1 PORT=3456 EXPRESS_SERVER_URL=http://127.0.0.1:3456
npx -y mcp-excalidraw-server@2.0.0 <command>
```

Prefira as ferramentas MCP `excalidraw_*` / `batch_create_elements` se estiverem na lista de tools desta sessão.

## Fluxo

1. `npx -y mcp-excalidraw-server@2.0.0 start` (com o `export` acima) se o canvas não estiver no ar.
2. Peça ao usuário para abrir `http://127.0.0.1:3456` (screenshot, SVG, Mermaid precisam da aba).
3. Siga o workflow da vendor skill (grid → add/apply → describe/screenshot → corrigir overlap).
4. Exporte artefato versionável para `docs/architecture/<nome>.excalidraw`. Não commite PNG temporário de screenshot.

## Diagnóstico rápido

```bash
ss -lnt | grep 3456 || true
curl -sS --max-time 3 http://127.0.0.1:3456/health
npx -y mcp-excalidraw-server@2.0.0 status
```

Se health falhar: `start` de novo com `PORT=3456`. Se `:3000` aparecer ocupado pelo canvas, `stop` imediatamente e reinicie na 3456.
