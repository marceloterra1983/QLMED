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
  listImpcgAuthorizations: vi.fn(),
  getImpcgAuthorization: vi.fn(),
  updateImpcgMissingFields: vi.fn(),
  getImpcgIngestState: vi.fn(),
  oneDriveFindFirst: vi.fn(),
  downloadOneDriveItemContent: vi.fn(),
  ensureValidOneDriveAccessToken: vi.fn(),
  runImpcgIngest: vi.fn(),
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

vi.mock('@/lib/impcg/store', () => ({
  listImpcgAuthorizations: mocks.listImpcgAuthorizations,
  getImpcgAuthorization: mocks.getImpcgAuthorization,
  updateImpcgMissingFields: mocks.updateImpcgMissingFields,
  getImpcgIngestState: mocks.getImpcgIngestState,
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

vi.mock('@/lib/impcg/ingest', () => ({
  runImpcgIngest: mocks.runImpcgIngest,
}));

import { GET as getList } from '@/app/api/gestao/impcg/route';
import { GET as getDetail, PATCH as patchDetail } from '@/app/api/gestao/impcg/[id]/route';
import { GET as getArquivo } from '@/app/api/gestao/impcg/[id]/arquivo/route';

const PAGE = '/gestao/impcg';

function listRequest(): Request {
  return new Request('http://localhost/api/gestao/impcg');
}

function invokeDetail(id: string) {
  return getDetail(new Request(`http://localhost/api/gestao/impcg/${id}`), {
    params: Promise.resolve({ id }),
  });
}

function invokeArquivo(id: string) {
  return getArquivo(new Request(`http://localhost/api/gestao/impcg/${id}/arquivo`), {
    params: Promise.resolve({ id }),
  });
}

describe('IMPCG ACL (AC-003, AC-012)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getOrCreateSingleCompany.mockResolvedValue({ id: 'company-1' });
    mocks.listImpcgAuthorizations.mockResolvedValue([]);
    mocks.getImpcgAuthorization.mockResolvedValue(null);
    mocks.getImpcgIngestState.mockResolvedValue(null);
    mocks.runImpcgIngest.mockResolvedValue({
      ok: true,
      processed: 0,
      skipped: 0,
      failedMailboxes: [],
      lastCollectedAt: '2026-08-30T13:05:00.000Z',
    });
  });

  describe('navigation page-gate', () => {
    it('maps /api/gestao to /gestao/impcg and keeps the page in VALID_PAGE_PATHS', () => {
      expect(VALID_PAGE_PATHS.has(PAGE)).toBe(true);
      expect(requiredPagesForApi('/api/gestao/impcg')).toEqual([PAGE]);
      expect(requiredPagesForApi('/api/gestao/impcg/clx/arquivo')).toEqual([PAGE]);
      expect(requiredPagesForApi('/api/gestao/impcg/sync')).toEqual([PAGE]);
    });

    it('denies viewer without the page (AC-003)', () => {
      const pages = ['/fiscal/invoices'];
      expect(canAccessPage('viewer', pages, PAGE)).toBe(false);
      expect(canAccessApi('viewer', pages, '/api/gestao/impcg')).toBe(false);
      expect(canAccessApi('viewer', pages, '/api/gestao/impcg/clx')).toBe(false);
      expect(canAccessApi('viewer', pages, '/api/gestao/impcg/clx/arquivo')).toBe(false);
    });

    it('allows viewer with the page and admin bypass', () => {
      expect(canAccessPage('viewer', [PAGE], PAGE)).toBe(true);
      expect(canAccessApi('viewer', [PAGE], '/api/gestao/impcg')).toBe(true);
      expect(canAccessPage('admin', ['/fiscal/invoices'], PAGE)).toBe(true);
      expect(canAccessApi('admin', ['/fiscal/invoices'], '/api/gestao/impcg/clx/arquivo')).toBe(true);
    });
  });

  describe('GET handlers', () => {
    it('returns 401 on list, detail and file when unauthenticated', async () => {
      mocks.requireAuth.mockRejectedValue(new Error('NOT_AUTHENTICATED'));

      await expect(getList(listRequest()).then((r) => r.status)).resolves.toBe(401);
      await expect(invokeDetail('clx1').then((r) => r.status)).resolves.toBe(401);
      await expect(invokeArquivo('clx1').then((r) => r.status)).resolves.toBe(401);
      expect(mocks.listImpcgAuthorizations).not.toHaveBeenCalled();
      expect(mocks.getImpcgAuthorization).not.toHaveBeenCalled();
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
      expect(mocks.listImpcgAuthorizations).not.toHaveBeenCalled();
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
      expect(body.canEdit).toBe(true);
      expect(body.items).toEqual([]);
    });

    it('does not leak another company authorization (404 on detail and file)', async () => {
      mocks.requireAuth.mockResolvedValue('user-ok');
      mocks.userFindUnique.mockResolvedValue({
        role: 'viewer',
        allowedPages: [PAGE],
      });
      mocks.getImpcgAuthorization.mockResolvedValue(null);

      await expect(invokeDetail('other-company-id').then((r) => r.status)).resolves.toBe(404);
      await expect(invokeArquivo('other-company-id').then((r) => r.status)).resolves.toBe(404);
      expect(mocks.getImpcgAuthorization).toHaveBeenCalledWith('company-1', 'other-company-id');
    });
  });

  describe('POST sync (T027 / AC-012)', () => {
    const syncFile = path.join(process.cwd(), 'src/app/api/gestao/impcg/sync/route.ts');

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

    it.skipIf(!existsSync(syncFile))('forbids viewer POST /api/gestao/impcg/sync', async () => {
      mocks.requireEditor.mockRejectedValue(new Error('FORBIDDEN'));
      mocks.requireAuth.mockResolvedValue('user-viewer');
      mocks.userFindUnique.mockResolvedValue({
        role: 'viewer',
        allowedPages: [PAGE],
      });

      const { POST } = await import('@/app/api/gestao/impcg/sync/route');
      const res = await POST();
      expect(res.status).toBe(403);
      expect(mocks.runImpcgIngest).not.toHaveBeenCalled();
    });

    it.skipIf(!existsSync(syncFile))('allows admin POST /api/gestao/impcg/sync', async () => {
      mocks.requireEditor.mockResolvedValue({ userId: 'user-admin', role: 'admin' });
      mocks.requireAuth.mockResolvedValue('user-admin');
      mocks.userFindUnique.mockResolvedValue({
        role: 'admin',
        allowedPages: [PAGE],
      });

      const { POST } = await import('@/app/api/gestao/impcg/sync/route');
      const res = await POST();
      expect(res.status).toBe(200);
      expect(mocks.runImpcgIngest).toHaveBeenCalledWith('company-1');
    });
  });

  describe('PATCH missing fields', () => {
    function invokePatch(id: string, body: Record<string, string>) {
      return patchDetail(
        new Request(`http://localhost/api/gestao/impcg/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }),
        { params: Promise.resolve({ id }) },
      );
    }

    it('forbids viewer PATCH', async () => {
      mocks.requireAuth.mockResolvedValue('user-viewer');
      mocks.userFindUnique.mockResolvedValue({
        role: 'viewer',
        allowedPages: [PAGE],
      });

      const res = await invokePatch('clx1', { issuedAt: '2023-08-10' });
      expect(res.status).toBe(403);
      expect(mocks.updateImpcgMissingFields).not.toHaveBeenCalled();
    });

    it('lets editor replace captured items (AC-017)', async () => {
      mocks.requireAuth.mockResolvedValue('user-editor');
      mocks.userFindUnique.mockResolvedValue({
        role: 'editor',
        allowedPages: [PAGE],
      });
      mocks.updateImpcgMissingFields.mockResolvedValue({
        id: 'clx1',
        issuedAt: '2023-08-10T00:00:00.000Z',
        oficioNumber: '17673',
        patientName: 'PLINIO ANTONIO ARANHA JUNIOR',
        patientRegistry: '66429737-4',
        doctorName: 'RODRIGO LUIZ ROCHA CARDOSO',
        doctorCrm: '13716',
        procedureName: 'TROCA VALVAR',
        hospitalName: 'HOSPITAL PRONCOR',
        totalAmount: '12550.00',
        fileName: 'OFICIO 17673.pdf',
        parseStatus: 'ok',
        parseMissingReason: null,
        oneDriveItemId: 'item-1',
        editedFields: ['items'],
        items: [],
      });

      const res = await patchDetail(
        new Request('http://localhost/api/gestao/impcg/clx1', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: [{
              description: 'KIT CEC',
              brand: 'EUROSETS',
              reference: 'AG5214',
              quantity: '1',
              unitAmount: '5500.00',
              lineTotal: '5500.00',
            }],
          }),
        }),
        { params: Promise.resolve({ id: 'clx1' }) },
      );
      expect(res.status).toBe(200);
      expect(mocks.updateImpcgMissingFields).toHaveBeenCalledWith(
        'company-1',
        'clx1',
        expect.objectContaining({
          items: [expect.objectContaining({
            description: 'KIT CEC',
            unitCents: 550_000,
            lineCents: 550_000,
          })],
        }),
      );
    });

    it('lets editor PATCH totalAmount in BRL (AC-017)', async () => {
      mocks.requireAuth.mockResolvedValue('user-editor');
      mocks.userFindUnique.mockResolvedValue({
        role: 'editor',
        allowedPages: [PAGE],
      });
      mocks.updateImpcgMissingFields.mockResolvedValue({
        id: 'clx1',
        issuedAt: '2023-08-10T00:00:00.000Z',
        oficioNumber: '17673',
        patientName: 'PLINIO ANTONIO ARANHA JUNIOR',
        patientRegistry: '66429737-4',
        doctorName: 'RODRIGO LUIZ ROCHA CARDOSO',
        doctorCrm: null,
        procedureName: 'TROCA VALVAR',
        hospitalName: 'HOSPITAL PRONCOR',
        totalAmount: '12550.00',
        fileName: 'OFICIO 17673.pdf',
        parseStatus: 'ok',
        parseMissingReason: null,
        oneDriveItemId: 'item-1',
        editedFields: ['totalAmount'],
        items: [],
      });

      const res = await invokePatch('clx1', { totalAmount: '12.550,00' });
      expect(res.status).toBe(200);
      expect(mocks.updateImpcgMissingFields).toHaveBeenCalledWith(
        'company-1',
        'clx1',
        expect.objectContaining({ totalCents: 1_255_000 }),
      );
    });

    it('lets editor fill the missing date', async () => {
      mocks.requireAuth.mockResolvedValue('user-editor');
      mocks.userFindUnique.mockResolvedValue({
        role: 'editor',
        allowedPages: [PAGE],
      });
      mocks.updateImpcgMissingFields.mockResolvedValue({
        id: 'clx1',
        issuedAt: '2023-08-10T00:00:00.000Z',
        oficioNumber: '17673',
        patientName: 'PLINIO ANTONIO ARANHA JUNIOR',
        patientRegistry: '66429737-4',
        doctorName: 'RODRIGO LUIZ ROCHA CARDOSO',
        doctorCrm: '13716',
        procedureName: 'TROCA VALVAR',
        hospitalName: 'HOSPITAL PRONCOR',
        totalAmount: '12550.00',
        fileName: 'OFICIO 17673.pdf',
        parseStatus: 'ok',
        parseMissingReason: null,
        oneDriveItemId: 'item-1',
        items: [],
      });

      const res = await invokePatch('clx1', { issuedAt: '2023-08-10' });
      expect(res.status).toBe(200);
      const payload = await res.json();
      expect(payload.parseStatus).toBe('ok');
      expect(payload.issuedAt).toBe('2023-08-10T00:00:00.000Z');
      expect(mocks.updateImpcgMissingFields).toHaveBeenCalledWith(
        'company-1',
        'clx1',
        expect.objectContaining({ issuedAt: new Date('2023-08-10T00:00:00.000Z') }),
      );
    });
  });
});
