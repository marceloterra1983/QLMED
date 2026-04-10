import { NextResponse } from 'next/server';
import { requireAuth, unauthorizedResponse } from '@/lib/auth';

type AnvisaSourceKey = 'produtos_saude' | 'medicamentos';

const PROBE_URLS: Record<AnvisaSourceKey, string> = {
  produtos_saude: 'https://consultas.anvisa.gov.br/',
  medicamentos: 'https://consultas.anvisa.gov.br/',
};

function isBlockedByHeaders(xFrameOptions: string, csp: string): { blocked: boolean; reason: string | null } {
  const xfo = xFrameOptions.toLowerCase();
  if (xfo.includes('deny') || xfo.includes('sameorigin')) {
    return { blocked: true, reason: `X-Frame-Options: ${xFrameOptions}` };
  }

  const cspLower = csp.toLowerCase();
  const frameAncestorsMatch = cspLower.match(/frame-ancestors\s+([^;]+)/);
  if (frameAncestorsMatch) {
    const policy = frameAncestorsMatch[1].trim();
    if (policy.includes("'none'") || policy.includes("'self'")) {
      return { blocked: true, reason: `CSP frame-ancestors: ${policy}` };
    }
  }

  return { blocked: false, reason: null };
}

export async function GET(req: Request) {
  try {
    await requireAuth();
  } catch {
    return unauthorizedResponse();
  }

  try {
    const { searchParams } = new URL(req.url);
    const source = (searchParams.get('source') || 'produtos_saude') as AnvisaSourceKey;
    const probeUrl = PROBE_URLS[source] || PROBE_URLS.produtos_saude;

    const response = await fetch(probeUrl, {
      method: 'GET',
      redirect: 'follow',
      cache: 'no-store',
      headers: {
        'user-agent': 'Mozilla/5.0 QLMED/1.0',
      },
    });

    const xFrameOptions = response.headers.get('x-frame-options') || '';
    const csp = response.headers.get('content-security-policy') || '';
    const blockedByHeader = isBlockedByHeaders(xFrameOptions, csp);

    const canEmbed = response.ok && !blockedByHeader.blocked;
    const reason = !response.ok
      ? `Resposta HTTP ${response.status}`
      : blockedByHeader.reason;

    return NextResponse.json({
      canEmbed,
      reason,
      status: response.status,
      headers: {
        xFrameOptions,
        contentSecurityPolicy: csp,
      },
    });
  } catch (error: any) {
    return NextResponse.json({
      canEmbed: false,
      reason: error?.message || 'Falha ao verificar disponibilidade do embed',
      status: null,
    });
  }
}
