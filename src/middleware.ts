import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { checkRateLimit, RATE_LIMITS, getRateLimitHeaders, RateLimitConfig } from '@/lib/rate-limit';

/**
 * Public API routes that don't require authentication.
 * All other /api/* routes require a valid session or API key.
 */
const PUBLIC_API_ROUTES = new Set([
  '/api/auth',           // NextAuth endpoints (login, callback, etc.)
  '/api/register',       // User registration
  '/api/health',         // Basic health check (details require auth, handled in route)
]);

function isPublicApiRoute(pathname: string): boolean {
  for (const route of PUBLIC_API_ROUTES) {
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

export async function middleware(req: NextRequest) {
  const isApiRoute = req.nextUrl.pathname.startsWith('/api/');
  const callbackUrl = req.nextUrl.pathname + req.nextUrl.search;

  // Rate limiting — checked before auth to block brute-force attempts early
  if (isApiRoute) {
    const rateLimitConfig = getRateLimitConfig(req.nextUrl.pathname);
    if (rateLimitConfig) {
      const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
        || req.headers.get('x-real-ip')
        || req.ip
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
      // Edge runtime can miss some env vars depending on deployment/runtime mode.
      // If expected is unavailable here, forward and let route-level auth validate.
      if (!expected) {
        return NextResponse.next();
      }

      if (await safeEqual(apiKey, expected)) {
        const requestHeaders = new Headers(req.headers);
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
      return NextResponse.next();
    }
  } catch (error) {
    console.warn('[Auth] Sessão inválida detectada no middleware; limpando cookies.', error);
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
