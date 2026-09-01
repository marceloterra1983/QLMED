# Findings de L3-borda

## QLMED-INT-001 — Webhook n8n faz req.text() sem limite de corpo; HMAC opcional
- severidade: high | status: confirmed | confiança: high
- local: src/app/api/webhooks/n8n/route.ts:74 (POST); src/app/api/webhooks/n8n/route.ts:42 (validateWebhookSignature)
- invariante: Limite de bytes antes de buffer; HMAC obrigatório em produção.
- cenário: req.text() unbounded; if (!secret) return true; notify loga payload; fetch interno sem timeout.
- esperado: Cap CL; HMAC fail-closed; timeout; não logar payload.
- observado: route.ts:41-76,102-170; logger.ts sem redact.
- causa raiz: Webhook compatível sem envelope de segurança obrigatório.
- correção mínima: Exigir secret em production; cap body; AbortSignal nos forwards.
- teste de regressão: POST 8MiB → 413; POST sem HMAC em production → 401.
- risco residual: Nonce process-local (INT-003).

## QLMED-INT-003 — Nonce HMAC do webhook é process-local
- severidade: medium | status: confirmed | confiança: high
- local: src/lib/n8n-webhook-security.ts:56 (consumedNonces)
- invariante: Replay HMAC falha em todas as réplicas.
- cenário: Map in-process; eviction 5min; ponytail comment admite o teto.
- esperado: Store compartilhado.
- observado: n8n-webhook-security.ts:56-73.
- causa raiz: Cache local.
- correção mínima: Tabela nonce ou Redis.
- teste de regressão: Mesmo nonce em dois processos: o segundo 401.
- risco residual: n/a

## QLMED-INT-006 — Action notify registra payload arbitrário
- severidade: medium | status: confirmed | confiança: high
- local: src/app/api/webhooks/n8n/route.ts:169 (notify)
- invariante: notify não loga XML/PII/token.
- cenário: log.info({payload}).
- esperado: Não logar payload ou allowlist de campos.
- observado: route.ts:167-170.
- causa raiz: Debug deixado em produção.
- correção mínima: Remover payload do log.
- teste de regressão: stdout sem chaves do payload.
- risco residual: n/a

## QLMED-INT-007 — Base64 do webhook não é estrito; decoded pode passar de 5MiB
- severidade: medium | status: confirmed | confiança: high
- local: src/app/api/webhooks/n8n/route.ts:127 (process-xml)
- invariante: Base64 estrito; decoded ≤ MAX_XML_SIZE.
- cenário: 7MiB encoded ≈ 5.25MiB; Buffer.from leniente.
- esperado: regex + decoded length.
- observado: route.ts:119-132.
- causa raiz: Cap no encoded.
- correção mínima: decoded.length ≤ 5MiB.
- teste de regressão: 7MiB zeros b64 → 413.
- risco residual: n/a

## QLMED-INT-009 — nextLink absoluto Graph/OneDrive reenvia Bearer a outra origem
- severidade: high | status: confirmed | confiança: high
- local: src/lib/graph-mail-client.ts:108 (graphJson); src/lib/onedrive-graph.ts:7 (graphEndpoint)
- invariante: Token Graph só vai a graph.microsoft.com (allowlist).
- cenário: startsWith('http') usa a URL crua com Authorization Bearer; fetch segue redirect.
- esperado: Permitir só https://graph.microsoft.com/; redirect:manual.
- observado: graph-mail-client.ts:108-168; onedrive-graph.ts:7-38.
- causa raiz: Tratar nextLink como opaco.
- correção mínima: Parse URL; host allowlist; não seguir redirect com Bearer.
- teste de regressão: nextLink https://evil.example recusa e não fetch.
- risco residual: CDN /content 302 — tratar download sem Authorization na 2ª hop.

## QLMED-INT-010 — Receita NFS-e baseUrl configurável sem allowlist (mTLS+Bearer)
- severidade: high | status: confirmed | confiança: high
- local: src/lib/schemas/receita.ts:12 (baseUrl); src/lib/receita-nfse-client.ts:188 (buildUrl)
- invariante: Certificado cliente só fala com ADN NF-e.
- cenário: z.string() nullable; https.request com cert/key/Authorization; VERIFY_SSL=false desliga TLS.
- esperado: https + host allowlist adn.nfse.gov.br / producaorestrita.
- observado: schemas/receita.ts:12; sync.ts:24-26; client 188-215.
- causa raiz: URL de operador sem allowlist.
- correção mínima: Allowlist de hosts; recusar IP privado; exigir VERIFY_SSL.
- teste de regressão: baseUrl http://169.254.169.254 rejeitado.
- risco residual: DNS rebinding se só checar hostname textual.

## QLMED-INT-011 — n8n baseUrl só z.string().url(); token X-N8N-API-KEY segue
- severidade: high | status: confirmed | confiança: high
- local: src/app/api/integrations/n8n/config/route.ts:17 (baseUrl)
- invariante: API key n8n só para hosts n8n conhecidos.
- cenário: z.string().url() aceita loopback/metadata; fetch com X-N8N-API-KEY.
- esperado: Allowlist de host/porta/path.
- observado: n8n/config/route.ts:15-20; n8n-client.ts:76-90.
- causa raiz: Validação de URL ≠ allowlist.
- correção mínima: Allowlist; bloquear link-local/RFC1918/metadata.
- teste de regressão: http://127.0.0.1:5678 rejeitado fora da allowlist explícita.
- risco residual: n8n interno legítimo precisa allowlist consciente.

## QLMED-INT-012 — EVO_API_URL sem allowlist; fetch segue redirect com apikey e PDF
- severidade: medium | status: confirmed | confiança: high
- local: src/lib/whatsapp-evolution.ts:29 (EVO_API_URL)
- invariante: apikey Evolution só para host conhecido.
- cenário: sem scheme/host allowlist; timeout 60s.
- esperado: Allowlist.
- observado: whatsapp-evolution.ts:29-68.
- causa raiz: URL de env.
- correção mínima: Allowlist host.
- teste de regressão: http://evil recusa.
- risco residual: n/a

## QLMED-INT-014 — GET webhook enumera actions com a master key
- severidade: low | status: confirmed | confiança: high
- local: src/app/api/webhooks/n8n/route.ts:181 (GET)
- invariante: Superfície mínima.
- cenário: GET devolve VALID_ACTIONS sem HMAC.
- esperado: POST only ou 404.
- observado: route.ts:181-189.
- causa raiz: Discovery endpoint.
- correção mínima: Remover GET.
- teste de regressão: GET 404/405.
- risco residual: n/a
