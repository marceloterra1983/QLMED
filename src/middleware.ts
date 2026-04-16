import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { checkRateLimit, RATE_LIMITS, getRateLimitHeaders, RateLimitConfig } from '@/lib/rate-limit';
import { canAccessApi, canAccessPage, PAGE_GROUPS } from '@/lib/navigation';

/**
 * Public API routes that don't require authentication.
 * All other /api/* routes require a valid session or API key.
 */
const PUBLIC_API_ROUTES = [
  '/api/auth',           // NextAuth endpoints (login, callback, etc.)
  '/api/register',       // User registration
  '/api/health',         // Basic health check (details require auth, handled in route)
];

function isPublicApiRoute(pathname: string): boolean {
  for (let i = 0; i < PUBLIC_API_ROUTES.length; i++) {
    const route = PUBLIC_API_ROUTES[i];
    if (pathname === route || pathname.startsWith(route + '/')) {
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

async function safeEqual(a: string, b: string): Promise<boolean> {
  if (a.length !== b.length) return false;

  try {
    const encoder = new TextEncoder();
    const [left, right] = await Promise.all([
      crypto.subtle.digest('SHA-256', encoder.encode(a)),
      crypto.subtle.digest('SHA-256', encoder.encode(b)),
    ]);

    const leftBytes = new Uint8Array(left);
    const rightBytes = new Uint8Array(right);
    let diff = 0;

    for (let i = 0; i < leftBytes.length; i += 1) {
      diff |= leftBytes[i] ^ rightBytes[i];
    }

    return diff === 0;
  } catch {
    return false;
  }
}

function clearAuthCookies(response: NextResponse) {
  for (const name of AUTH_COOKIE_NAMES) {
    response.cookies.set(name, '', {
      maxAge: 0,
      path: '/',
      sameSite: 'lax',
    });
  }
}

function getRateLimitConfig(pathname: string): RateLimitConfig | null {
  if (pathname.startsWith('/api/auth/')) return RATE_LIMITS.login;
  if (pathname.includes('/upload')) return RATE_LIMITS.upload;
  if (pathname.startsWith('/api/webhooks/')) return RATE_LIMITS.webhook;
  return null;
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
      const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
        || req.headers.get('x-real-ip')
        || 'unknown';
      const key = `${clientIp}:${req.nextUrl.pathname}`;
      const result = checkRateLimit(key, rateLimitConfig);
      if (!result.allowed) {
        return NextResponse.json(
          { error: 'Muitas tentativas. Tente novamente mais tarde.' },
          { status: 429, headers: getRateLimitHeaders(result.remaining, result.resetAt) }
        );
      }
    }
  }

  // Allow public API routes without authentication (after rate limiting)
  if (isApiRoute && isPublicApiRoute(req.nextUrl.pathname)) {
    return NextResponse.next();
  }

  // Allow API key authentication for n8n / external integrations
  if (isApiRoute) {
    const apiKey = req.headers.get('x-api-key');
    const expected = process.env.QLMED_API_KEY;
    if (apiKey) {
      // Previously forwarded requests when `expected` was missing, which let
      // ANY non-empty x-api-key value bypass validation if the env var didn't
      // reach the edge runtime. Now fails closed: if the edge can't verify,
      // the client gets 503 so the misconfiguration is loud instead of silent.
      if (!expected) {
        console.error('[Auth] QLMED_API_KEY unavailable at edge — rejecting x-api-key request');
        return NextResponse.json(
          { error: 'Servidor mal configurado (QLMED_API_KEY ausente no edge)' },
          { status: 503 },
        );
      }

      if (await safeEqual(apiKey, expected)) {
        // Strip any client-supplied x-api-key-validated header so only the
        // middleware can set it — route-level auth trusts this flag.
        const requestHeaders = new Headers(req.headers);
        requestHeaders.delete('x-api-key-validated');
        requestHeaders.set('x-api-key-validated', '1');
        return NextResponse.next({
          request: { headers: requestHeaders },
        });
      }
    }
  }

  try {
    const token = await getToken({
      req,
      secret: process.env.NEXTAUTH_SECRET,
    });
    if (token) {
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
    '/relatorios/:path*',
    '/visaogeral/:path*',
    // Protect ALL API routes — public ones are handled by allowlist inside middleware
    '/api/:path*',
  ],
};
