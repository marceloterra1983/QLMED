import { existsSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  canAccessApi,
  canAccessPage,
  requiredPagesForApi,
  VALID_PAGE_PATHS,
} from '@/lib/navigation';

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  requireEditor: vi.fn(),
  getOrCreateSingleCompany: vi.fn(),
  userFindUnique: vi.fn(),
  listCassemsAuthorizations: vi.fn(),
  getCassemsAuthorization: vi.fn(),
  getCassemsIngestState: vi.fn(),
  oneDriveFindFirst: vi.fn(),
  downloadOneDriveItemContent: vi.fn(),
  ensureValidOneDriveAccessToken: vi.fn(),
  runCassemsIngest: vi.fn(),
}));

vi.mock('@/lib/auth', async () => {
  const { NextResponse } = await import('next/server');
  return {
    requireAuth: mocks.requireAuth,
    requireEditor: mocks.requireEditor,
    unauthorizedResponse: () => NextResponse.json({ error: 'Não autorizado' }, { status: 401 }),
    forbiddenResponse: () => NextResponse.json({ error: 'Sem permissão' }, { status: 403 }),
  };
});

vi.mock('@/lib/single-company', () => ({
  getOrCreateSingleCompany: mocks.getOrCreateSingleCompany,
}));

vi.mock('@/lib/prisma', () => ({
  default: {
    user: { findUnique: mocks.userFindUnique },
    oneDriveConnection: { findFirst: mocks.oneDriveFindFirst },
  },
}));

vi.mock('@/lib/cassems/store', () => ({
  listCassemsAuthorizations: mocks.listCassemsAuthorizations,
  getCassemsAuthorization: mocks.getCassemsAuthorization,
  getCassemsIngestState: mocks.getCassemsIngestState,
}));

vi.mock('@/lib/onedrive-connections', () => ({
  ensureValidOneDriveAccessToken: mocks.ensureValidOneDriveAccessToken,
}));

vi.mock('@/lib/onedrive-client', () => ({
  downloadOneDriveItemContent: mocks.downloadOneDriveItemContent,
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn() }),
}));

vi.mock('@/lib/cassems/ingest', () => ({
  runCassemsIngest: mocks.runCassemsIngest,
}));

import { GET as getList } from '@/app/api/gestao/cassems/route';
import { GET as getDetail } from '@/app/api/gestao/cassems/[id]/route';
import { GET as getArquivo } from '@/app/api/gestao/cassems/[id]/arquivo/route';

const PAGE = '/gestao/cassems';

function listRequest(): Request {
  return new Request('http://localhost/api/gestao/cassems');
}

function invokeDetail(id: string) {
  return getDetail(new Request(`http://localhost/api/gestao/cassems/${id}`), {
    params: Promise.resolve({ id }),
  });
}

function invokeArquivo(id: string) {
  return getArquivo(new Request(`http://localhost/api/gestao/cassems/${id}/arquivo`), {
    params: Promise.resolve({ id }),
  });
}

describe('CASSEMS ACL (AC-003, AC-012)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getOrCreateSingleCompany.mockResolvedValue({ id: 'company-1' });
    mocks.listCassemsAuthorizations.mockResolvedValue([]);
    mocks.getCassemsAuthorization.mockResolvedValue(null);
    mocks.getCassemsIngestState.mockResolvedValue(null);
    mocks.runCassemsIngest.mockResolvedValue({
      ok: true,
      processed: 0,
      skipped: 0,
      failedMailboxes: [],
      lastCollectedAt: '2026-08-30T14:35:00.000Z',
    });
  });

  describe('navigation page-gate', () => {
    it('maps /api/gestao/cassems to /gestao/cassems and keeps the page in VALID_PAGE_PATHS', () => {
      expect(VALID_PAGE_PATHS.has(PAGE)).toBe(true);
      expect(requiredPagesForApi('/api/gestao/cassems')).toEqual([PAGE]);
      expect(requiredPagesForApi('/api/gestao/cassems/clx/arquivo')).toEqual([PAGE]);
      expect(requiredPagesForApi('/api/gestao/cassems/sync')).toEqual([PAGE]);
      expect(requiredPagesForApi('/api/gestao/impcg')).toEqual(['/gestao/impcg']);
      expect(canAccessApi('viewer', ['/gestao/impcg'], '/api/gestao/cassems')).toBe(false);
    });

    it('denies viewer without the page (AC-003)', () => {
      const pages = ['/fiscal/invoices'];
      expect(canAccessPage('viewer', pages, PAGE)).toBe(false);
      expect(canAccessApi('viewer', pages, '/api/gestao/cassems')).toBe(false);
    });

    it('allows viewer with the page and admin bypass', () => {
      expect(canAccessPage('viewer', [PAGE], PAGE)).toBe(true);
      expect(canAccessApi('viewer', [PAGE], '/api/gestao/cassems')).toBe(true);
      expect(canAccessPage('admin', ['/fiscal/invoices'], PAGE)).toBe(true);
    });
  });

  describe('GET handlers', () => {
    it('returns 401 on list, detail and file when unauthenticated', async () => {
      mocks.requireAuth.mockRejectedValue(new Error('NOT_AUTHENTICATED'));

      await expect(getList(listRequest()).then((r) => r.status)).resolves.toBe(401);
      await expect(invokeDetail('clx1').then((r) => r.status)).resolves.toBe(401);
      await expect(invokeArquivo('clx1').then((r) => r.status)).resolves.toBe(401);
      expect(mocks.listCassemsAuthorizations).not.toHaveBeenCalled();
    });

    it('returns 403 on list, detail and file when the user lacks the page (AC-003)', async () => {
      mocks.requireAuth.mockResolvedValue('user-viewer');
      mocks.userFindUnique.mockResolvedValue({
        role: 'viewer',
        allowedPages: ['/fiscal/invoices'],
      });

      await expect(getList(listRequest()).then((r) => r.status)).resolves.toBe(403);
      await expect(invokeDetail('clx1').then((r) => r.status)).resolves.toBe(403);
      await expect(invokeArquivo('clx1').then((r) => r.status)).resolves.toBe(403);
      expect(mocks.getOrCreateSingleCompany).not.toHaveBeenCalled();
    });

    it('allows admin without the page in allowedPages (bypass)', async () => {
      mocks.requireAuth.mockResolvedValue('user-admin');
      mocks.userFindUnique.mockResolvedValue({
        role: 'admin',
        allowedPages: ['/fiscal/invoices'],
      });

      const res = await getList(listRequest());
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.canSync).toBe(true);
      expect(body.items).toEqual([]);
    });
  });

  describe('POST sync (AC-012)', () => {
    const syncFile = path.join(process.cwd(), 'src/app/api/gestao/cassems/sync/route.ts');

    it('lists canSync=false for a viewer with the page', async () => {
      mocks.requireAuth.mockResolvedValue('user-viewer');
      mocks.userFindUnique.mockResolvedValue({
        role: 'viewer',
        allowedPages: [PAGE],
      });

      const res = await getList(listRequest());
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.canSync).toBe(false);
    });

    it.skipIf(!existsSync(syncFile))('forbids viewer POST /api/gestao/cassems/sync', async () => {
      mocks.requireEditor.mockRejectedValue(new Error('FORBIDDEN'));
      const { POST } = await import('@/app/api/gestao/cassems/sync/route');
      const res = await POST();
      expect(res.status).toBe(403);
      expect(mocks.runCassemsIngest).not.toHaveBeenCalled();
    });
  });
});
