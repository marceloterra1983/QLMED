/**
 * O workflow diário do n8n lê /api/invoices e /api/contacts/nickname/batch por
 * chave de API. As rotas usavam `requireAuth()` sem escopo — por chave, só
 * `admin` passava — e o n8n andava com a chave admin de ambiente. Agora
 * `invoices:read` e `contacts:read` bastam, cada um só na sua rota. O guarda
 * REAL é exercitado; só chave/sessão/banco são substituídos.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';

const RAW = 'qlmed_' + 'cd'.repeat(32);
const HASH = createHash('sha256').update(RAW, 'utf8').digest('hex');
const state = vi.hoisted(() => ({ scopes: null as null | string[], header: null as string | null }));
const accessLog = vi.hoisted(() => vi.fn<(arg: { data: { path: string } }) => Promise<unknown>>(async () => ({})));

vi.mock('next/headers', () => ({ headers: async () => ({ get: (n: string) => (n === 'x-api-key' ? state.header : null) }) }));
vi.mock('next-auth', () => ({ getServerSession: async () => null }));
vi.mock('@/lib/auth-options', () => ({ authOptions: {} }));
vi.mock('@/lib/single-company', () => ({ getOrCreateSingleCompany: async () => ({ id: 'co1', cnpj: '11222333000181' }) }));
vi.mock('@/lib/prisma', () => {
  // Depois da auth, os handlers lêem dados; qualquer modelo/método devolve
  // vazio. O teste só afirma o desfecho da AUTENTICAÇÃO (401/403 ou não).
  const empty = () => new Proxy({}, { get: (_t, m) => async () => (String(m).startsWith('count') ? 0 : String(m).startsWith('findMany') ? [] : null) });
  const prisma = new Proxy({}, {
    get: (_t, model) => {
      if (model === 'apiKey') return {
        findUnique: async ({ where }: { where: { keyHash: string } }) =>
          where.keyHash === HASH && state.scopes ? { id: 'ak1', scopes: state.scopes, createdById: 'u-admin', revokedAt: null, createdBy: { role: 'admin', status: 'active' } } : null,
        update: async () => ({}),
      };
      if (model === 'accessLog') return { create: (arg: { data: { path: string } }) => { void accessLog(arg); return { catch: () => undefined }; } };
      if (model === 'user') return { findUnique: async () => null };
      return empty();
    },
  });
  return { default: prisma, prisma };
});

async function get(path: string) {
  const mod = path.startsWith('/api/invoices') ? await import('@/app/api/invoices/route') : await import('@/app/api/contacts/nickname/batch/route');
  return mod.GET(new Request('http://localhost' + path));
}
const INV = '/api/invoices?limit=1';
const NICK = '/api/contacts/nickname/batch?cnpjs=11222333000181';
beforeEach(() => { vi.resetModules(); accessLog.mockClear(); state.scopes = null; state.header = null; });

describe('n8n: leitura por chave de API com escopo mínimo', () => {
  it('invoices:read passa em GET /api/invoices', async () => { state.scopes = ['invoices:read']; state.header = RAW; expect([401, 403]).not.toContain((await get(INV)).status); });
  it('contacts:read passa em GET nickname/batch', async () => { state.scopes = ['contacts:read']; state.header = RAW; expect([401, 403]).not.toContain((await get(NICK)).status); });
  it('escopo trocado: contacts:read em /api/invoices → 403', async () => { state.scopes = ['contacts:read']; state.header = RAW; expect((await get(INV)).status).toBe(403); });
  it('escopo trocado: invoices:read em nickname/batch → 403', async () => { state.scopes = ['invoices:read']; state.header = RAW; expect((await get(NICK)).status).toBe(403); });
  it('escopo de outro domínio → 403 nas duas', async () => { state.scopes = ['notifications:dispatch']; state.header = RAW; expect((await get(INV)).status).toBe(403); expect((await get(NICK)).status).toBe(403); });
  it('admin continua a passar nas duas', async () => { state.scopes = ['admin']; state.header = RAW; expect([401, 403]).not.toContain((await get(INV)).status); expect([401, 403]).not.toContain((await get(NICK)).status); });
  it('sem chave e sem sessão → 401', async () => { expect((await get(INV)).status).toBe(401); expect((await get(NICK)).status).toBe(401); });
  it('AccessLog regista o escopo usado', async () => { state.scopes = ['invoices:read']; state.header = RAW; await get(INV); expect(accessLog.mock.calls.map(([a]) => a.data.path).some((p) => p.includes('keyId=ak1') && p.includes('scope=invoices:read'))).toBe(true); });
});
