import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { timingSafeEqual } from 'crypto';

const AUTH_COOKIE_NAMES = [
  'next-auth.session-token',
  '__Secure-next-auth.session-token',
  'next-auth.callback-url',
  '__Secure-next-auth.callback-url',
  'next-auth.csrf-token',
  '__Host-next-auth.csrf-token',
];

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
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

export async function middleware(req: NextRequest) {
  const isApiRoute = req.nextUrl.pathname.startsWith('/api/');
  const callbackUrl = req.nextUrl.pathname + req.nextUrl.search;

  // Allow API key authentication for n8n / external integrations
  if (isApiRoute) {
    const apiKey = req.headers.get('x-api-key');
    const expected = process.env.QLMED_API_KEY;
    if (apiKey && expected && safeEqual(apiKey, expected)) {
      const requestHeaders = new Headers(req.headers);
      requestHeaders.set('x-api-key-validated', '1');
      return NextResponse.next({
        request: { headers: requestHeaders },
      });
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
    '/visaogeral/:path*',
    '/cadastro/:path*',
    '/fiscal/:path*',
    '/financeiro/:path*',
    '/sistema/:path*',
    '/api/companies/:path*',
    '/api/invoices/:path*',
    '/api/dashboard/:path*',
    '/api/nsdocs/:path*',
    '/api/certificate/:path*',
    '/api/onedrive/:path*',
    '/api/users/:path*',
    '/api/financeiro/:path*',
    '/api/products/:path*',
    '/api/customers/:path*',
    '/api/suppliers/:path*',
    '/api/anvisa/:path*',
    '/api/webhooks/:path*',
  ],
};
