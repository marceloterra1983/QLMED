import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  renderHtmlToPdf: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  requireAuth: mocks.requireAuth,
  requireSessionAdmin: vi.fn(),
  unauthorizedResponse: () => new Response(null, { status: 401 }),
  forbiddenResponse: () => new Response(null, { status: 403 }),
}));
vi.mock('@/lib/pdf/render', () => ({ renderHtmlToPdf: mocks.renderHtmlToPdf }));
vi.mock('@/lib/prisma', () => ({ default: { user: { findFirst: vi.fn() } } }));
vi.mock('nodemailer', () => ({ default: { createTransport: vi.fn() } }));

import { GET } from '@/app/api/reports/valvulas-importadas/pdf/route';

const EMPTY_REPORT = {
  summary: { totalProducts: 0 },
  products: [],
  customerYearlySales: { years: [], customers: [] },
  meta: { invoicesScanned: 0, issuedInvoicesScanned: 0 },
};

/** O handler só usa nextUrl.searchParams e headers.get('cookie'). */
function request(origin: string) {
  const url = new URL(`${origin}/api/reports/valvulas-importadas/pdf?action=download`);
  return {
    nextUrl: url,
    headers: new Headers({ cookie: 'next-auth.session-token=segredo-da-sessao' }),
  } as never;
}

describe('GET /api/reports/valvulas-importadas/pdf — OBS-004', () => {
  const savedNextAuthUrl = process.env.NEXTAUTH_URL;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockResolvedValue('user-1');
    mocks.renderHtmlToPdf.mockResolvedValue(Buffer.from('%PDF-1.4'));
    process.env.NEXTAUTH_URL = 'https://app.interno.qlmed';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(EMPTY_REPORT), { status: 200 })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env.NEXTAUTH_URL = savedNextAuthUrl;
  });

  it('usa NEXTAUTH_URL e ignora o Host da requisição', async () => {
    const response = await GET(request('https://atacante.example'));

    expect(response.status).toBe(200);
    const [calledUrl] = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(new URL(String(calledUrl)).origin).toBe('https://app.interno.qlmed');
    expect(String(calledUrl)).not.toContain('atacante.example');
  });

  it('manda o fetch interno com AbortSignal (não fica pendurado)', async () => {
    await GET(request('https://app.interno.qlmed'));

    const [, init] = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(init.signal.aborted).toBe(false);
  });

  it('falha em vez de adivinhar a origem quando NEXTAUTH_URL não está setado', async () => {
    delete process.env.NEXTAUTH_URL;

    const response = await GET(request('https://atacante.example'));

    expect(response.status).toBeGreaterThanOrEqual(500);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
