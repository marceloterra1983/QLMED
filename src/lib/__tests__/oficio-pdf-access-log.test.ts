import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  requireImpcgPage: vi.fn(),
  requireCassemsPage: vi.fn(),
  getImpcgAuthorization: vi.fn(),
  getCassemsAuthorization: vi.fn(),
  connectionFindFirst: vi.fn(),
  accessLogCreate: vi.fn(),
  ensureToken: vi.fn(),
  openContent: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  requireAuth: mocks.requireAuth,
  unauthorizedResponse: () => new Response(null, { status: 401 }),
  forbiddenResponse: () => new Response(null, { status: 403 }),
}));
vi.mock('@/lib/impcg/access', () => ({ requireImpcgPage: mocks.requireImpcgPage }));
vi.mock('@/lib/cassems/access', () => ({ requireCassemsPage: mocks.requireCassemsPage }));
vi.mock('@/lib/impcg/store', () => ({ getImpcgAuthorization: mocks.getImpcgAuthorization }));
vi.mock('@/lib/cassems/store', () => ({ getCassemsAuthorization: mocks.getCassemsAuthorization }));
vi.mock('@/lib/onedrive-client', () => ({ openOneDriveItemContent: mocks.openContent }));
vi.mock('@/lib/onedrive-connections', () => ({
  ensureValidOneDriveAccessToken: mocks.ensureToken,
}));
vi.mock('@/lib/prisma', () => ({
  default: {
    oneDriveConnection: { findFirst: mocks.connectionFindFirst },
    accessLog: { create: mocks.accessLogCreate },
  },
}));

import { GET as impcgGet } from '@/app/api/gestao/impcg/[id]/arquivo/route';
import { GET as cassemsGet } from '@/app/api/gestao/cassems/[id]/arquivo/route';

const USER_ID = 'user-42';
const OFICIO_ID = 'oficio-abc';

function params() {
  return { params: Promise.resolve({ id: OFICIO_ID }) };
}

/** Espera o microtask do fire-and-forget do AccessLog. */
const flush = () => new Promise((r) => setImmediate(r));

describe.each([
  {
    label: 'IMPCG',
    get: impcgGet,
    access: mocks.requireImpcgPage,
    store: mocks.getImpcgAuthorization,
    slug: 'impcg-oficio',
  },
  {
    label: 'CASSEMS',
    get: cassemsGet,
    access: mocks.requireCassemsPage,
    store: mocks.getCassemsAuthorization,
    slug: 'cassems-oficio',
  },
])('GET download de ofício $label — PRIV-002', ({ get, access, store, slug }) => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockResolvedValue(USER_ID);
    access.mockResolvedValue({ ok: true, userId: USER_ID, role: 'viewer', canSync: false, companyId: 'company-1' });
    store.mockResolvedValue({ id: OFICIO_ID, oneDriveItemId: 'drive-item-1', fileName: 'oficio.pdf' });
    mocks.connectionFindFirst.mockResolvedValue({ id: 'conn-1', driveId: 'drive-1' });
    mocks.ensureToken.mockResolvedValue('token');
    mocks.openContent.mockResolvedValue({ body: new ReadableStream(), size: 1234 });
    mocks.accessLogCreate.mockResolvedValue({});
  });

  it('grava um AccessLog atribuído ao usuário que abriu o PDF', async () => {
    const response = await get(new Request('http://localhost'), params());
    await flush();

    expect(response.status).toBe(200);
    expect(mocks.accessLogCreate).toHaveBeenCalledTimes(1);
    const { data } = mocks.accessLogCreate.mock.calls[0][0];
    expect(data.userId).toBe(USER_ID);
    expect(data.path).toContain(slug);
    expect(data.path).toContain(OFICIO_ID);
  });

  it('não serve o PDF de cache compartilhado nem de disco', async () => {
    const response = await get(new Request('http://localhost'), params());

    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  });

  it('não grava AccessLog quando o ofício não existe', async () => {
    store.mockResolvedValue(null);

    const response = await get(new Request('http://localhost'), params());
    await flush();

    expect(response.status).toBe(404);
    expect(mocks.accessLogCreate).not.toHaveBeenCalled();
  });

  it('a falha ao gravar a trilha não derruba o download', async () => {
    mocks.accessLogCreate.mockRejectedValue(new Error('db down'));

    const response = await get(new Request('http://localhost'), params());
    await flush();

    expect(response.status).toBe(200);
  });

  it('exige a conexão OneDrive nomeada, sem cair em qualquer outra da empresa', async () => {
    // Antes havia um segundo findFirst só por companyId: sem a caixa nomeada o
    // PDF saía por outra conexão qualquer e devolvia 200.
    mocks.connectionFindFirst.mockResolvedValue(null);

    const response = await get(new Request('http://localhost'), params());
    await flush();

    expect(response.status).toBe(404);
    expect(mocks.connectionFindFirst).toHaveBeenCalledTimes(1);
    expect(mocks.connectionFindFirst.mock.calls[0][0].where.accountEmail).toBeTruthy();
  });
});
