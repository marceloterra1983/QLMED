# Findings de L4-segredos

## QLMED-FILE-007 — PFX em plaintext no banco; upload sem vínculo CNPJ/validade/ambiente
- severidade: high | status: confirmed | confiança: high
- local: prisma/schema.prisma:236 (pfxData); src/app/api/certificate/upload/route.ts:73 (POST)
- invariante: Chave A1 cifrada; identidade = CNPJ da empresa; ambiente explícito.
- cenário: pfxData Bytes cru; senha AES-GCM; environment hardcoded production; CNPJ extraído mas não comparado; validade só no uso SEFAZ. decrypt() aceita plaintext (crypto.ts:60-61).
- esperado: Cifrar pfxData; exigir CNPJ/validade/ambiente; recusar plaintext.
- observado: schema 236-244; upload/route.ts:73-90; crypto.ts:60-61.
- causa raiz: Cifrou a senha e não o PKCS#12; fallback legado.
- correção mínima: Encrypt pfxData; bind CNPJ; fail decrypt se não for formato salt:iv:tag:ct.
- teste de regressão: Upload CNPJ ≠ empresa → 400; decrypt sem ':' não retorna o input.
- risco residual: Backup lógico ainda contém PFX até reencrypt/backfill.

## QLMED-OBS-001 — Pino sem redact/correlation; notify e erros podem logar payload
- severidade: high | status: confirmed | confiança: high
- local: src/lib/logger.ts:9 (pino); src/app/api/webhooks/n8n/route.ts:169 (notify)
- invariante: Logs sem token, senha, PFX, XML completo, dado clínico.
- cenário: createLogger só {module}; notify log.info({payload}); redact só ad hoc no nsdocs-client.
- esperado: redact paths globais; requestId; serializers.
- observado: logger.ts:8-21; webhook 167-170.
- causa raiz: Logger mínimo.
- correção mínima: redact: ['payload','xml*','pfx*','password','authorization']; reqId.
- teste de regressão: notify com xml não aparece no stdout JSON.
- risco residual: Pino err.stack ainda pode carregar snippet.

## QLMED-OBS-003 — Health público expõe build SHA e latência do DB
- severidade: medium | status: confirmed | confiança: high
- local: src/app/api/health/route.ts:97 (publicResponse)
- invariante: Health anônimo é status booleano.
- cenário: status, db.latencyMs, build.commitSha/source.
- esperado: omitir SHA/latência ou exigir auth.
- observado: health/route.ts:97-103; memory só autenticado (teste cobre).
- causa raiz: Health de deploy reutilizado como público.
- correção mínima: Público: {status}. SHA só autenticado.
- teste de regressão: sem cookie sem commitSha.
- risco residual: Load balancer pode precisar do SHA — então rede interna.

## QLMED-OBS-004 — PDF do relatório re-fetch com Cookie sem timeout
- severidade: medium | status: confirmed | confiança: high
- local: src/app/api/reports/valvulas-importadas/pdf/route.ts:263 (fetch)
- invariante: Fetch interno com timeout e origem pinada.
- cenário: NEXTAUTH_URL||origin + Cookie inbound; sem AbortSignal; puppeteer setContent sem timeout.
- esperado: AbortSignal; origem allowlist.
- observado: pdf/route.ts:263-276; pdf/render.ts:28-37.
- causa raiz: PDF como wrap do JSON da mesma API.
- correção mínima: Chamar a função de dados direto; timeout.
- teste de regressão: Host header evil não é usado se NEXTAUTH_URL set.
- risco residual: n/a

## QLMED-OBS-005 — CSP production com script-src/style-src unsafe-inline
- severidade: medium | status: confirmed | confiança: high
- local: next.config.mjs:14 (script-src)
- invariante: CSP sem unsafe-inline em script.
- cenário: Comentário nonce backlog 2026-07-21; dev ainda unsafe-eval.
- esperado: nonce/hash.
- observado: next.config.mjs:8-44.
- causa raiz: Nonce não migrado.
- correção mínima: nonce Next.
- teste de regressão: CSP sem unsafe-inline em script-src prod.
- risco residual: Cloudflare insights inline.

## QLMED-PRIV-002 — Download de PDF clínico com ACL de página mas sem audit de quem abriu
- severidade: high | status: confirmed | confiança: high
- local: src/app/api/gestao/impcg/[id]/arquivo/route.ts:37 (GET)
- invariante: Acesso a ofício é atribuível (AccessLog userId+id).
- cenário: Stream OneDrive; log bytes não userId; sem AccessLog; Cache-Control 300s; fallback qualquer conexão OneDrive da empresa.
- esperado: AccessLog; cache privado curto ou no-store; conexão nomeada.
- observado: arquivo/route.ts:37-74; ACL testes 404 cross-id.
- causa raiz: Download tratado como binário anônimo.
- correção mínima: AccessLog action=impcg_pdf_read; Cache-Control no-store.
- teste de regressão: GET arquivo cria AccessLog com userId.
- risco residual: OneDrive audit separado.

## QLMED-FISCAL-009 — Agregação incremental e rebuild usam matching de revenda diferente
- severidade: medium | status: confirmed | confiança: high
- local: src/lib/product-aggregate-updater.ts:64 (productKey); src/lib/product-aggregation/aggregate.ts:307 (fuzzy)
- invariante: Incremental ≡ rebuild para os mesmos invoices.
- cenário: Incremental exact key; rebuild fuzzy R_CODE/R_EAN/R_DESC.
- esperado: Uma função de matching.
- observado: updater vs aggregate.ts.
- causa raiz: Dois algoritmos.
- correção mínima: Unificar; teste igualdade fixture.
- teste de regressão: incremental then rebuild delta=0.
- risco residual: n/a

## QLMED-FISCAL-010 — Ambiente de certificado desconhecido vira production; DistDFe sempre prod
- severidade: medium | status: confirmed | confiança: high
- local: src/lib/nfe-emission/environment.ts:3 (resolveEmissionEnvironment)
- invariante: Homologação não emite em produção.
- cenário: !== 'homologation' → production. distDfeIsProduction always true. Upload força production.
- esperado: Fail closed fora do enum.
- observado: environment.ts:3-13; certificate upload environment production.
- causa raiz: Default fail-open para prod.
- correção mínima: Enum estrito; DistDFe log explícito.
- teste de regressão: 'homologacao' rejeita.
- risco residual: DistDFe prod-only pode ser decisão — então documentar.

## QLMED-FISCAL-011 — signedXml omitido no GET; logger sem denylist — residual
- severidade: low | status: accepted | confiança: high
- local: src/app/api/nfe-emissions/[id]/route.ts:20 (omit signedXml)
- invariante: PEM/XML assinado nunca em log/resposta.
- cenário: GET/PATCH omitem; POST create signedXml null. PATCH draft não limpa signedXml no DB.
- esperado: redact global; clear signedXml on reject.
- observado: [id]/route.ts:20,74; logger sem redact.
- causa raiz: Omissão pontual.
- correção mínima: redact + clear signedXml.
- teste de regressão: GET emission JSON keys exclude signedXml.
- risco residual: n/a
