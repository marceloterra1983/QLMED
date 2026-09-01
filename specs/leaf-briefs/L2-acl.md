# Findings de L2-acl

## QLMED-AUTH-001 — Export XML de invoices sem companyId
- severidade: high | status: confirmed | confiança: high
- local: src/app/api/invoices/export-xml/route.ts:32 (POST)
- invariante: Leitura tenant-scoped inclui companyId do servidor.
- cenário: count/findMany só por issueDate/type/direction; saveXmlToFile sem prefixo de empresa.
- esperado: where.companyId = getOrCreateSingleCompany().id
- observado: export-xml/route.ts:32-69.
- causa raiz: Scan global da tabela.
- correção mínima: Filtrar companyId; path com companyId.
- teste de regressão: Duas empresas; editor A exporta 0 de B.
- risco residual: Arquivos já gravados sem prefixo.

## QLMED-AUTH-002 — Cache ANVISA ProductRegistry sem companyId
- severidade: medium | status: confirmed | confiança: high
- local: src/app/api/anvisa/validate/route.ts:41 (findFirst)
- invariante: ProductRegistry é por empresa.
- cenário: findFirst/update por anvisaCode só.
- esperado: companyId no where.
- observado: anvisa/validate/route.ts:41-111.
- causa raiz: Cache tratado como global.
- correção mínima: Filtrar companyId.
- teste de regressão: Validate A não atualiza B.anvisaSyncedAt.
- risco residual: Dado ANVISA é público.

## QLMED-AUTH-003 — Cancelamento NF-e updateMany só por accessKey
- severidade: medium | status: confirmed | confiança: high
- local: src/lib/nfe-cancellation.ts:135 (applyNfeCancellation)
- invariante: Mutação Invoice inclui companyId.
- cenário: where accessKey+cancelledAt null. Unique global mitiga IDOR clássico.
- esperado: where {accessKey, companyId}.
- observado: nfe-cancellation.ts:135-138; teste trava where sem companyId.
- causa raiz: Chave de acesso como PK global.
- correção mínima: Passar companyId.
- teste de regressão: updateMany where inclui companyId.
- risco residual: n/a

## QLMED-AUTH-004 — Import local escolhe a primeira empresa se o CNPJ canônico não existe
- severidade: high | status: confirmed | confiança: high
- local: src/lib/local-xml-sync/file-import.ts:65 (getTargetCompany)
- invariante: Empresa canônica é o CNPJ fixo; ausência pausa o import.
- cenário: findUnique CNPJ falha; findFirst orderBy createdAt; invoices entram no tenant errado.
- esperado: return null (já existe para zero empresas).
- observado: file-import.ts:65-82.
- causa raiz: Heurística de disponibilidade divergente do helper CNPJ.
- correção mínima: Remover findFirst; pausar.
- teste de regressão: Só Company com outro CNPJ → getTargetCompany null.
- risco residual: CNPJ hardcoded 07832309000197 é decisão de produto.

## QLMED-AUTH-005 — allowedPages vazio concede acesso total de páginas/API
- severidade: high | status: confirmed | confiança: high
- local: src/lib/navigation.ts:146 (canAccessPage)
- invariante: Lista vazia = nenhuma página, não todas.
- cenário: canAccessPage/Api retornam true se length===0. UI 'todas as páginas' envia []. Testes travam o comportamento legado.
- esperado: [] deny; full access só admin ou lista explícita.
- observado: navigation.ts:137-164; users/route.ts:73; schema default [].
- causa raiz: Compatibilidade legada + UI usa [] como 'todas'.
- correção mínima: [] = deny; persistir ALL_PAGES explícito; migrar usuários.
- teste de regressão: viewer [] 403 em /api/financeiro e /sistema/usuarios.
- risco residual: Migração não pode trancar operadores atuais sem backfill.

## QLMED-AUTH-006 — QLMED_API_KEY de ambiente autentica como admin
- severidade: high | status: confirmed | confiança: high
- local: src/lib/auth.ts:82 (getApiKeyContext)
- invariante: Credencial de integração é hashed, com scope mínimo e revogável.
- cenário: Fallback env → scopes:['admin'] bound ao primeiro admin. Webhook n8n usa a mesma chave e a reencaminha.
- esperado: Remover fallback; chave DB com scopes.
- observado: auth.ts:82-91; webhooks/n8n/route.ts:24-38.
- causa raiz: Back-compat nunca removido.
- correção mínima: Falhar fechado sem chave DB; n8n com scope mínimo.
- teste de regressão: x-api-key=env em /api/invoices → 401.
- risco residual: Rotação n8n na remoção.

## QLMED-AUTH-007 — Teste de guard de rota é regex de presença do helper
- severidade: low | status: confirmed | confiança: high
- local: src/lib/__tests__/api-route-guards.test.ts:10 (GUARD_PATTERN)
- invariante: 401/403 executados.
- cenário: collectRouteFiles + regex.
- esperado: Negativos HTTP nas rotas P0.
- observado: api-route-guards.test.ts:10-39.
- causa raiz: Lint no lugar de teste de auth.
- correção mínima: 401 em export-xml e invoices/[id].
- teste de regressão: Remover requireEditor de export-xml quebra teste 401.
- risco residual: n/a

## QLMED-AUTH-008 — Rate limit de login é Map in-process
- severidade: medium | status: confirmed | confiança: high
- local: src/lib/rate-limit.ts:17 (store)
- invariante: Limite de brute-force sobrevive a réplicas.
- cenário: Map por processo; restart zera.
- esperado: Store compartilhado ou documentar single-instance.
- observado: rate-limit.ts:17-52; middleware.ts:151-171.
- causa raiz: Limiter edge-friendly.
- correção mínima: Postgres/Redis ou pino de single-instance.
- teste de regressão: Dois Maps permitem 5+5 logins.
- risco residual: ADR-0012 impede lockout sem identidade.

## QLMED-AUTH-009 — IP do rate limit usa último X-Forwarded-For por default
- severidade: medium | status: confirmed | confiança: high
- local: src/middleware.ts:104 (getClientIp)
- invariante: Header de proxy só se hop confiável.
- cenário: last XFF; testes travam isso. Não lê CF-Connecting-IP.
- esperado: Hop count ou CF-Connecting-IP.
- observado: middleware.ts:104-116.
- causa raiz: Sem hop configurado.
- correção mínima: CF-Connecting-IP; default deny headers.
- teste de regressão: XFF spoof não muda bucket se socket IP usado.
- risco residual: Hop count errado limita o proxy.

## QLMED-AUTH-012 — Logout-everywhere atrasa até 5 min em hits só de middleware
- severidade: medium | status: confirmed | confiança: high
- local: src/lib/auth-options.ts:207 (jwt callback)
- invariante: tokenVersion diverge falha no próximo request.
- cenário: jwt skip DB; middleware só checa typeof number; requireAuth compara na hora.
- esperado: Revalidar tokenVersion sempre.
- observado: auth-options.ts:207-227; middleware.ts:204-247.
- causa raiz: Edge sem Prisma; refresh otimizado.
- correção mínima: Sempre ler tokenVersion ou staleMs=0 para versão.
- teste de regressão: Após revoke, GET página painel redireciona login na hora.
- risco residual: Skew de dbRefreshedAt.

## QLMED-AUTH-013 — /api/users/me* exigem página Usuários no middleware
- severidade: medium | status: confirmed | confiança: high
- local: src/lib/navigation.ts:111 (/api/users)
- invariante: Self-service de sessão não exige /sistema/usuarios.
- cenário: Prefixo /api/users → página usuarios → 403. Mascarado hoje por AUTH-005.
- esperado: Exceção /api/users/me.
- observado: navigation.ts:111 vs users/me routes.
- causa raiz: Prefixo grosso.
- correção mínima: Mapear /me antes.
- teste de regressão: viewer só /fiscal/invoices PUT preferences 200.
- risco residual: n/a

## QLMED-AUTH-014 — Prefixo de API não mapeado é fail-open no allowedPages
- severidade: medium | status: confirmed | confiança: high
- local: src/lib/navigation.ts:161 (canAccessApi)
- invariante: API desconhecida deny para não-admin.
- cenário: required=[] → true. GET n8n/config só requireAuth.
- esperado: Allowlist explícita SESSION_ANY.
- observado: navigation.ts:124-164; n8n/config GET.
- causa raiz: Default allow.
- correção mínima: Fail closed.
- teste de regressão: viewer fiscal-only 403 GET n8n/config.
- risco residual: Workers usam API key, não essa ACL.
