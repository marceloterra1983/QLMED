# Gates: L8 — Integração, PR, deploy

Scope: tudo junto, CI do GitHub verde, PR aberto e mesclado, deploy em produção SÓ com autorização explícita do dono nesta rodada.

- [ ] G1: gates L1–L7 todos verdes re-executados pelo driver (não pelo executor da folha)
  CHECK: for f in specs/042-cadastro-documentos-certidoes/gates/L[1-7]-*.md; do node ~/.claude/skills/unlazy/scripts/gate-check.mjs --status "$f" | tail -1; done
  EXPECT: /(?!.*pending)/
  EVIDENCE: pending

- [ ] G2: validação completa do AGENTS.md rodada de fato
  CHECK: npm run docs:validate --silent && npx tsc --noEmit && npm run lint --silent && npx vitest run 2>&1 | tail -2 && npm run build 2>&1 | tail -2
  EXPECT: /passed/
  EVIDENCE: pending

- [ ] G3: graph atualizado
  CHECK: graphify update . 2>&1 | tail -1
  EXPECT: /./
  EVIDENCE: pending

- [ ] G4: PR aberto contra main com corpo apontando SPEC-042; CI verde no SHA final (esperar pelo SHA, não pelo PR — concurrency cancela runs a cada push)
  CHECK: gh pr view --json number,url,statusCheckRollup -q '.url + " " + ([.statusCheckRollup[].conclusion] | join(","))'
  EXPECT: /SUCCESS/
  EVIDENCE: pending

- [ ] G5: dono autorizou deploy desta feature nesta rodada (registrar frase e data)
  EVIDENCE: pending

- [ ] G6: deploy via workflow_dispatch seguido pelo run ID do próprio dispatch; produção responde e /cadastro/documentos existe no bundle
  CHECK: curl -fsS -o /dev/null -w "%{http_code}" https://app.qlmed.com.br/cadastro/documentos
  EXPECT: /^(200|307|302)$/
  EVIDENCE: pending

- [ ] G7: variáveis novas em /srv/qlmed/env/app.env (DOCUMENTOS_WHATSAPP_ENABLED, DOCUMENTOS_WHATSAPP_GROUP_JID) só depois de G7 de L7; ficam ausentes até lá
  EVIDENCE: pending
