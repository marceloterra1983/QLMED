import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  requireEditor: vi.fn(),
  requireAdmin: vi.fn(),
  getOrCreateSingleCompany: vi.fn(),
  listPendingGroups: vi.fn(),
  setManualLink: vi.fn(),
  runNfeItemLinkSweep: vi.fn(),
}));

vi.mock('@/lib/auth', async () => {
  const { NextResponse } = await import('next/server');
  return {
    requireAuth: mocks.requireAuth,
    requireEditor: mocks.requireEditor,
    requireAdmin: mocks.requireAdmin,
    unauthorizedResponse: () => NextResponse.json({ error: 'Não autorizado' }, { status: 401 }),
    forbiddenResponse: () => NextResponse.json({ error: 'Sem permissão' }, { status: 403 }),
  };
});
vi.mock('@/lib/single-company', () => ({ getOrCreateSingleCompany: mocks.getOrCreateSingleCompany }));
vi.mock('@/lib/nfe-item-link/store', () => ({
  listPendingGroups: mocks.listPendingGroups,
  setManualLink: mocks.setManualLink,
}));
vi.mock('@/lib/nfe-item-link/sweep', () => ({ runNfeItemLinkSweep: mocks.runNfeItemLinkSweep }));

import { GET, POST } from '@/app/api/products/nfe-item-links/route';
import { POST as SWEEP } from '@/app/api/products/nfe-item-links/sweep/route';

function post(url: string, body?: unknown) {
  return new Request(`http://localhost${url}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe('/api/products/nfe-item-links', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockResolvedValue('user-1');
    mocks.requireEditor.mockResolvedValue({ userId: 'user-1', role: 'editor' });
    mocks.requireAdmin.mockResolvedValue({ userId: 'user-1', role: 'admin' });
    mocks.getOrCreateSingleCompany.mockResolvedValue({ id: 'company-1' });
  });

  it('GET exige autenticação', async () => {
    mocks.requireAuth.mockRejectedValue(new Error('UNAUTHORIZED'));
    const res = await GET(new Request('http://localhost/api/products/nfe-item-links'));
    expect(res.status).toBe(401);
  });

  it('GET devolve grupos pendentes da empresa com search/limit/offset', async () => {
    mocks.listPendingGroups.mockResolvedValue({ groups: [{ supplierCnpj: '1', supplierCode: 'X', itemCount: 3 }], totalGroups: 1, totalItems: 3 });
    const res = await GET(new Request('http://localhost/api/products/nfe-item-links?search=abc&limit=10&offset=20'));
    expect(res.status).toBe(200);
    expect(mocks.listPendingGroups).toHaveBeenCalledWith({ companyId: 'company-1', search: 'abc', limit: 10, offset: 20 });
    const body = await res.json();
    expect(body.totalItems).toBe(3);
  });

  it('POST leitor sem permissão de escrita → 403', async () => {
    mocks.requireEditor.mockRejectedValue(new Error('FORBIDDEN'));
    const res = await POST(post('/api/products/nfe-item-links', { productRegistryId: 'p1', linkId: 'l1' }));
    expect(res.status).toBe(403);
    expect(mocks.setManualLink).not.toHaveBeenCalled();
  });

  it('POST sem escopo (nem linkId nem fornecedor+cProd) → 400', async () => {
    const res = await POST(post('/api/products/nfe-item-links', { productRegistryId: 'p1' }));
    expect(res.status).toBe(400);
  });

  it('POST grava MANUAL para o grupo fornecedor + cProd e devolve o código', async () => {
    mocks.setManualLink.mockResolvedValue({ updated: 7, codigo: '005079' });
    const res = await POST(post('/api/products/nfe-item-links', { productRegistryId: 'p1', supplierCnpj: '66877184000180', supplierCode: 'ICV-1332' }));
    expect(res.status).toBe(200);
    expect(mocks.setManualLink).toHaveBeenCalledWith({
      companyId: 'company-1', userId: 'user-1', productRegistryId: 'p1', supplierCnpj: '66877184000180', supplierCode: 'ICV-1332',
    });
    expect(await res.json()).toEqual({ ok: true, updated: 7, codigo: '005079' });
  });

  it('POST produto de outra empresa/inexistente → 404', async () => {
    mocks.setManualLink.mockRejectedValue(new Error('PRODUCT_NOT_FOUND'));
    const res = await POST(post('/api/products/nfe-item-links', { productRegistryId: 'zzz', linkId: 'l1' }));
    expect(res.status).toBe(404);
  });

  it('sweep exige admin e devolve 409 quando o lock está ocupado', async () => {
    mocks.requireAdmin.mockRejectedValue(new Error('FORBIDDEN'));
    expect((await SWEEP(post('/api/products/nfe-item-links/sweep'))).status).toBe(403);

    mocks.requireAdmin.mockResolvedValue({ userId: 'user-1', role: 'admin' });
    mocks.runNfeItemLinkSweep.mockResolvedValue(null);
    expect((await SWEEP(post('/api/products/nfe-item-links/sweep'))).status).toBe(409);

    mocks.runNfeItemLinkSweep.mockResolvedValue({ invoices: 10, items: 50, linked: 45, pending: 5, writes: 3, byStrategy: { S2: 45 } });
    const res = await SWEEP(post('/api/products/nfe-item-links/sweep?dryRun=1'));
    expect(res.status).toBe(200);
    expect(mocks.runNfeItemLinkSweep).toHaveBeenCalledWith({ companyId: 'company-1', dryRun: true, force: false });
  });
});
