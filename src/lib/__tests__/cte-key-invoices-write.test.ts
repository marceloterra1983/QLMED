/**
 * O sync de CT-e chama POST /api/invoices/upload com chave de API. A rota
 * exige `editor`; por chave, `requireRole` só mapeava `admin` → admin, então a
 * chave do CT-e ficou `{admin}`. Agora `invoices:write` basta — e só ele.
 * O guarda REAL de `@/lib/auth` é exercitado; só o que lê chave/sessão/banco
 * é substituído.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';

const RAW = 'qlmed_' + 'ab'.repeat(32);
const HASH = createHash('sha256').update(RAW, 'utf8').digest('hex');
const state = vi.hoisted(() => ({ key: null as null | { scopes: string[] }, header: null as string | null }));
const accessLog = vi.hoisted(() => vi.fn<(arg: { data: { path: string } }) => Promise<unknown>>(async () => ({})));

vi.mock('next/headers', () => ({ headers: async () => ({ get: (n: string) => (n === 'x-api-key' ? state.header : null) }) }));
vi.mock('next-auth', () => ({ getServerSession: async () => null }));
vi.mock('@/lib/auth-options', () => ({ authOptions: {} }));
vi.mock('@/lib/single-company', () => ({ getOrCreateSingleCompany: async () => ({ id: 'co1', cnpj: '11222333000181' }) }));
vi.mock('@/lib/prisma', () => {
  const prisma = {
    apiKey: {
      findUnique: async ({ where }: { where: { keyHash: string } }) =>
        where.keyHash === HASH && state.key
          ? { id: 'ak1', scopes: state.key.scopes, createdById: 'u-admin', revokedAt: null, createdBy: { role: 'admin', status: 'active' } }
          : null,
      // `getApiKeyContext` carimba lastUsedAt; sem isto o lookup "falha" e vira 401.
      update: async () => ({}),
    },
    accessLog: { create: (arg: { data: { path: string } }) => { void accessLog(arg); return { catch: () => undefined }; } },
    user: { findUnique: async () => null },
  };
  return { default: prisma, prisma };
});

async function post() {
  const { POST } = await import('@/app/api/invoices/upload/route');
  return POST(new Request('http://localhost/api/invoices/upload', { method: 'POST', body: new FormData() }));
}

beforeEach(() => { vi.resetModules(); accessLog.mockClear(); state.key = null; state.header = null; });

describe('POST /api/invoices/upload por chave de API', () => {
  it('invoices:write passa da autenticação (não 401/403)', async () => {
    state.key = { scopes: ['invoices:write'] }; state.header = RAW;
    const res = await post();
    expect([401, 403]).not.toContain(res.status);
  });
  it('escopo de outro domínio (notifications:dispatch) → 403', async () => {
    state.key = { scopes: ['notifications:dispatch', 'notifications:assets'] }; state.header = RAW;
    expect((await post()).status).toBe(403);
  });
  it('admin continua a passar', async () => {
    state.key = { scopes: ['admin'] }; state.header = RAW;
    const res = await post();
    expect([401, 403]).not.toContain(res.status);
  });
  it('sem chave e sem sessão → 401', async () => {
    expect((await post()).status).toBe(401);
  });
  it('AccessLog regista o escopo usado', async () => {
    state.key = { scopes: ['invoices:write'] }; state.header = RAW;
    await post();
    const paths = accessLog.mock.calls.map(([arg]) => arg.data.path);
    expect(paths.some((p) => p.includes('keyId=ak1') && p.includes('scope=invoices:write'))).toBe(true);
  });
});
