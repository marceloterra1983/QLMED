import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { checkRateLimit, RATE_LIMITS, getRateLimitHeaders, RateLimitConfig } from '@/lib/rate-limit';
import { canAccessApi, canAccessPage, PAGE_GROUPS } from '@/lib/navigation';
import { API_KEY_REQUEST_METHOD_HEADER, API_KEY_REQUEST_PATH_HEADER } from '@/lib/api-key-scopes';

/**
 * Public API routes that don't require authentication.
 * All other /api/* routes require a valid session or API key.
 */
const PUBLIC_API_ROUTES = [
  '/api/auth',           // NextAuth endpoints (login, callback, etc.) — except /api/auth/logout which requires auth
  '/api/health',         // Public: status/db up-or-down; build/latency/memory/uptime need session (route)
];

/**
 * Sub-paths under a PUBLIC_API_ROUTES prefix that should still require auth.
 * Keeps the coarse allowlist pattern but lets us punch holes for sensitive
 * endpoints (e.g. logout, which must know WHO is logging out).
 */
const PROTECTED_SUBPATHS = [
  '/api/auth/logout',
];

const API_KEY_PASSTHROUGH_PREFIXES = [
  '/api/anvisa',
  '/api/cnpj',
  '/api/contacts',
  '/api/cte',
  '/api/customers',
  '/api/dashboard',
  '/api/estoque',
  '/api/financeiro',
  '/api/fiscal',
  '/api/invoices',
  '/api/ncm',
  '/api/notifications',
  '/api/nsdocs',
  '/api/products',
  '/api/receita',
  '/api/reports',
  '/api/suppliers',
  '/api/webhooks',
];

function isPublicApiRoute(pathname: string): boolean {
  // Explicit protected sub-paths override the coarse allowlist prefixes.
  for (let j = 0; j < PROTECTED_SUBPATHS.length; j++) {
    const sub = PROTECTED_SUBPATHS[j];
    if (pathname === sub || pathname.startsWith(sub + '/')) {
      return false;
    }
  }
  for (let i = 0; i < PUBLIC_API_ROUTES.length; i++) {
    const route = PUBLIC_API_ROUTES[i];
    if (pathname === route || pathname.startsWith(route + '/')) {
      return true;
    }
  }
  return false;
}

export function allowsRouteLevelApiKeyAuth(pathname: string): boolean {
  for (const prefix of API_KEY_PASSTHROUGH_PREFIXES) {
    if (pathname === prefix || pathname.startsWith(prefix + '/')) {
      return true;
    }
  }
  return false;
}

const AUTH_COOKIE_NAMES = [
  'next-auth.session-token',
  '__Secure-next-auth.session-token',
  'next-auth.callback-url',
  '__Secure-next-auth.callback-url',
  'next-auth.csrf-token',
  '__Host-next-auth.csrf-token',
];

function clearAuthCookies(response: NextResponse) {
  for (const name of AUTH_COOKIE_NAMES) {
    response.cookies.set(name, '', {
      maxAge: 0,
      path: '/',
      sameSite: 'lax',
    });
  }
}

export function getRateLimitConfig(pathname: string): RateLimitConfig | null {
  if (pathname === '/api/auth/callback/credentials') return RATE_LIMITS.login;
  if (pathname.includes('/upload')) return RATE_LIMITS.upload;
  if (pathname.startsWith('/api/webhooks/')) return RATE_LIMITS.webhook;
  return null;
}

function isValidHeaderIp(value: string) {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 45) return false;
  return /^[0-9a-fA-F:.]+$/.test(trimmed);
}

export function getClientIp(headers: Headers) {
  if (process.env.TRUST_PROXY_HEADERS === 'false') return 'untrusted-proxy';

  const forwardedFor = headers.get('x-forwarded-for');
  if (forwardedFor) {
    const ips = forwardedFor.split(',').map((part) => part.trim()).filter(isValidHeaderIp);
    const last = ips.at(-1);
    if (last) return last;
  }

  const realIp = headers.get('x-real-ip');
  if (realIp && isValidHeaderIp(realIp)) return realIp.trim();
  return 'unknown';
}

/**
 * Returns the canonical panel page path that matches the current request,
 * or null when the request isn't for a gated panel page (e.g. root, /login).
 */
function resolvePanelPagePath(pathname: string): string | null {
  for (const group of PAGE_GROUPS) {
    for (const page of group.pages) {
      if (pathname === page.path || pathname.startsWith(page.path + '/')) {
        return page.path;
      }
    }
  }
  return null;
}

/**
 * Picks the first page the user is allowed to see for redirects. Falls back
 * to /fiscal/dashboard (admins) and /sobre (no allowed pages at all).
 */
function firstAllowedPage(role: string | undefined, allowedPages: string[] | undefined): string {
  if (role === 'admin') return '/fiscal/dashboard';
  if (allowedPages && allowedPages.length > 0) {
    const first = allowedPages.find((p) => typeof p === 'string' && p.startsWith('/'));
    if (first) return first;
  }
  return '/sobre';
}

export async function middleware(req: NextRequest) {
  const isApiRoute = req.nextUrl.pathname.startsWith('/api/');
  const callbackUrl = req.nextUrl.pathname + req.nextUrl.search;

  // Rate limiting — checked before auth to block brute-force attempts early
  if (isApiRoute) {
    const rateLimitConfig = getRateLimitConfig(req.nextUrl.pathname);
    if (rateLimitConfig) {
      const clientIp = getClientIp(req.headers);
      const key = `${clientIp}:${req.nextUrl.pathname}`;
      const result = checkRateLimit(key, rateLimitConfig);
      if (!result.allowed) {
        return NextResponse.json(
          { error: 'Muitas tentativas. Tente novamente mais tarde.' },
          { status: 429, headers: getRateLimitHeaders(result.remaining, result.resetAt) }
        );
      }
      if (req.nextUrl.pathname === '/api/auth/callback/credentials') {
        const globalResult = checkRateLimit('global:/api/auth/callback/credentials', RATE_LIMITS.loginGlobal);
        if (!globalResult.allowed) {
          return NextResponse.json(
            { error: 'Muitas tentativas. Tente novamente mais tarde.' },
            { status: 429, headers: getRateLimitHeaders(globalResult.remaining, globalResult.resetAt) }
          );
        }
      }
    }
  }

  // Allow public API routes without authentication (after rate limiting)
  if (isApiRoute && isPublicApiRoute(req.nextUrl.pathname)) {
    return NextResponse.next();
  }

  // API key validation is done at the route layer (auth.ts:getApiKeyContext)
  // where Prisma can hash-lookup against ApiKey and enforce scopes. The Edge
  // middleware only allows pass-through for known protected API prefixes that
  // have route-level guards, and strips any spoofed validation marker.
  if (isApiRoute) {
    const apiKey = req.headers.get('x-api-key');
    if (apiKey && allowsRouteLevelApiKeyAuth(req.nextUrl.pathname)) {
      const requestHeaders = new Headers(req.headers);
      requestHeaders.delete('x-api-key-validated');
      requestHeaders.delete(API_KEY_REQUEST_PATH_HEADER);
      requestHeaders.delete(API_KEY_REQUEST_METHOD_HEADER);
      requestHeaders.set(API_KEY_REQUEST_PATH_HEADER, req.nextUrl.pathname);
      requestHeaders.set(API_KEY_REQUEST_METHOD_HEADER, req.method.toUpperCase());
      return NextResponse.next({ request: { headers: requestHeaders } });
    }
  }

  try {
    const token = await getToken({
      req,
      secret: process.env.NEXTAUTH_SECRET,
    });
    if (token) {
      // Fail closed: JWT must carry a numeric tokenVersion (set at login/bootstrap).
      // Missing/invalid version = revoked or pre-version token → force re-login.
      // Edge cannot compare to DB; jwt callback refuses rebind on divergence and
      // empties the token so the next rewrite also fails this gate.
      if (typeof token.tokenVersion !== 'number') {
        console.warn('[Auth] Session rejected: missing tokenVersion', {
          userId: token.id,
          path: req.nextUrl.pathname,
        });
        // Fall through to 401 / login redirect with cookie clear.
      } else {
        // Enforce allowedPages server-side. UI-only enforcement (SidebarNav/useRole)
        // was bypassable by any authenticated user via direct API/page calls.
        const role = typeof token.role === 'string' ? token.role : undefined;
        const allowedPages = Array.isArray(token.allowedPages)
          ? (token.allowedPages as string[])
          : undefined;

        if (isApiRoute) {
          if (!canAccessApi(role, allowedPages, req.nextUrl.pathname)) {
            console.warn('[Auth] API access denied by allowedPages', {
              userId: token.id,
              path: req.nextUrl.pathname,
            });
            return NextResponse.json({ error: 'Sem permissão para este recurso' }, { status: 403 });
          }
          return NextResponse.next();
        }

        // Panel page requests: check the matched page against allowedPages.
        const pagePath = resolvePanelPagePath(req.nextUrl.pathname);
        if (pagePath && !canAccessPage(role, allowedPages, pagePath)) {
          console.warn('[Auth] Page access denied by allowedPages', {
            userId: token.id,
            path: req.nextUrl.pathname,
          });
          // Redirect to a safe default page the user is allowed to see.
          const fallback = firstAllowedPage(role, allowedPages);
          const target = req.nextUrl.clone();
          target.pathname = fallback;
          target.search = '';
          return NextResponse.redirect(target);
        }
        return NextResponse.next();
      }
    }
  } catch (error) {
    // Edge Runtime middleware — pino not available. Structured stderr log so
    // operators can grep by `[Auth]` and aggregators (Loki, CloudWatch) pick it up.
    console.error('[Auth] Sessão inválida detectada no middleware; limpando cookies.', {
      err: error instanceof Error ? error.message : String(error),
      path: req.nextUrl.pathname,
    });
  }

  if (isApiRoute) {
    const response = NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    clearAuthCookies(response);
    return response;
  }

  const loginUrl = req.nextUrl.clone();
  loginUrl.pathname = '/login';
  loginUrl.searchParams.set('callbackUrl', callbackUrl);
  const response = NextResponse.redirect(loginUrl);
  clearAuthCookies(response);
  return response;
}

export const config = {
  matcher: [
    // Protect all panel pages
    '/cadastro/:path*',
    '/fiscal/:path*',
    '/financeiro/:path*',
    '/sistema/:path*',
    '/estoque/:path*',
    '/gestao/:path*',
    '/relatorios/:path*',
    '/visaogeral/:path*',
    // Protect ALL API routes — public ones are handled by allowlist inside middleware
    '/api/:path*',
  ],
};
