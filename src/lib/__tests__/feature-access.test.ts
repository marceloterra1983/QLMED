import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  userFindUnique: vi.fn(),
  getOrCreateSingleCompany: vi.fn(),
  getSingleCompany: vi.fn(),
  canAccessPage: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  requireAuth: mocks.requireAuth,
  unauthorizedResponse: () => ({ status: 401, json: () => ({ error: 'Não autorizado' }) }),
  forbiddenResponse: () => ({ status: 403, json: () => ({ error: 'Sem permissão' }) }),
}));

vi.mock('@/lib/single-company', () => ({
  getOrCreateSingleCompany: mocks.getOrCreateSingleCompany,
  getSingleCompany: mocks.getSingleCompany,
}));

vi.mock('@/lib/navigation', () => ({
  canAccessPage: mocks.canAccessPage,
}));

vi.mock('@/lib/prisma', () => ({
  default: {
    user: { findUnique: mocks.userFindUnique },
  },
}));

describe('feature-access', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('retorna 401 quando não autenticado', async () => {
    mocks.requireAuth.mockRejectedValue(new Error('UNAUTHENTICATED'));
    const { requireFeatureAccess } = await import('@/lib/feature-access');

    const result = await requireFeatureAccess({ pagePath: '/gestao/cassems' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect((result.response as unknown as { status: number }).status).toBe(401);
    }
  });

  it('retorna 403 quando requireAuth lança FORBIDDEN', async () => {
    mocks.requireAuth.mockRejectedValue(new Error('FORBIDDEN'));
    const { requireFeatureAccess } = await import('@/lib/feature-access');

    const result = await requireFeatureAccess({ pagePath: '/gestao/cassems' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect((result.response as unknown as { status: number }).status).toBe(403);
    }
  });

  it('retorna 403 quando o usuário não possui permissão na página', async () => {
    mocks.requireAuth.mockResolvedValue('user-1');
    mocks.userFindUnique.mockResolvedValue({ role: 'viewer', allowedPages: [] });
    mocks.canAccessPage.mockReturnValue(false);

    const { requireFeatureAccess } = await import('@/lib/feature-access');
    const result = await requireFeatureAccess({ pagePath: '/gestao/impcg' });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect((result.response as unknown as { status: number }).status).toBe(403);
    }
  });

  it('retorna 404 quando empresa não é encontrada', async () => {
    mocks.requireAuth.mockResolvedValue('user-1');
    mocks.userFindUnique.mockResolvedValue({ role: 'admin', allowedPages: ['/cadastro/documentos'] });
    mocks.canAccessPage.mockReturnValue(true);
    mocks.getSingleCompany.mockResolvedValue(null);

    const { requireFeatureAccess } = await import('@/lib/feature-access');
    const result = await requireFeatureAccess({
      pagePath: '/cadastro/documentos',
      useGetOrCreateCompany: false,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(404);
    }
  });

  it('retorna ok: true com canSync e canWrite verdadeiros para editor', async () => {
    mocks.requireAuth.mockResolvedValue('user-editor');
    mocks.userFindUnique.mockResolvedValue({ role: 'editor', allowedPages: ['/gestao/cassems'] });
    mocks.canAccessPage.mockReturnValue(true);
    mocks.getOrCreateSingleCompany.mockResolvedValue({ id: 'comp-123' });

    const { requireFeatureAccess } = await import('@/lib/feature-access');
    const result = await requireFeatureAccess({ pagePath: '/gestao/cassems' });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.userId).toBe('user-editor');
      expect(result.role).toBe('editor');
      expect(result.companyId).toBe('comp-123');
      expect(result.canSync).toBe(true);
      expect(result.canWrite).toBe(true);
    }
  });

  it('retorna ok: true com canSync e canWrite falsos para viewer', async () => {
    mocks.requireAuth.mockResolvedValue('user-viewer');
    mocks.userFindUnique.mockResolvedValue({ role: 'viewer', allowedPages: ['/gestao/unimed-cg'] });
    mocks.canAccessPage.mockReturnValue(true);
    mocks.getOrCreateSingleCompany.mockResolvedValue({ id: 'comp-123' });

    const { requireFeatureAccess } = await import('@/lib/feature-access');
    const result = await requireFeatureAccess({ pagePath: '/gestao/unimed-cg' });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.userId).toBe('user-viewer');
      expect(result.role).toBe('viewer');
      expect(result.canSync).toBe(false);
      expect(result.canWrite).toBe(false);
    }
  });
});
