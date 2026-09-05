import { describe, expect, it, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { routineHistoryQuery } from '@/lib/rotinas-history';

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  userFindUnique: vi.fn(),
  syncLogFindMany: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  requireAuth: mocks.requireAuth,
  unauthorizedResponse: () =>
    new Response(JSON.stringify({ error: 'Não autorizado' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    }),
  forbiddenResponse: () =>
    new Response(JSON.stringify({ error: 'Sem permissão' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    }),
}));

vi.mock('@/lib/prisma', () => ({
  default: {
    user: { findUnique: mocks.userFindUnique },
    syncLog: { findMany: mocks.syncLogFindMany },
  },
}));

import { GET } from '../route';

function invoke(id: string) {
  return GET(new Request(`http://localhost/api/sistema/rotinas/${id}/history`), {
    params: Promise.resolve({ id }),
  });
}

describe('routineHistoryQuery', () => {
  it('mapeia syncs fiscais para SyncLog e demais para none', () => {
    expect(routineHistoryQuery('sefaz-auto-sync').syncMethods).toEqual(['sefaz']);
    expect(routineHistoryQuery('nsdocs-auto-sync').syncMethods).toEqual(['nsdocs']);
    expect(routineHistoryQuery('receita-nfse-sync').syncMethods).toEqual(['receita_nfse']);
    expect(routineHistoryQuery('stuck-sync-recovery').source).toBe('sync_log');
    expect(routineHistoryQuery('documentos-ingest').source).toBe('none');
    expect(routineHistoryQuery('documentos-ingest').unavailableReason).toMatch(/não persiste/i);
  });
});

describe('GET /api/sistema/rotinas/[id]/history', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('403 sem a página Rotinas', async () => {
    mocks.requireAuth.mockResolvedValueOnce('user-viewer');
    mocks.userFindUnique.mockResolvedValueOnce({
      role: 'viewer',
      allowedPages: ['/fiscal/invoices'],
    });
    const res = await invoke('sefaz-auto-sync');
    expect(res.status).toBe(403);
    expect(mocks.syncLogFindMany).not.toHaveBeenCalled();
  });

  it('404 para rotina inexistente', async () => {
    mocks.requireAuth.mockResolvedValueOnce('user-admin');
    mocks.userFindUnique.mockResolvedValueOnce({ role: 'admin', allowedPages: [] });
    const res = await invoke('nao-existe');
    expect(res.status).toBe(404);
  });

  it('retorna items do SyncLog para sefaz-auto-sync', async () => {
    mocks.requireAuth.mockResolvedValueOnce('user-admin');
    mocks.userFindUnique.mockResolvedValueOnce({ role: 'admin', allowedPages: [] });
    mocks.syncLogFindMany.mockResolvedValueOnce([
      {
        id: 'log-1',
        syncMethod: 'sefaz',
        status: 'completed',
        newDocs: 2,
        updatedDocs: 1,
        skippedDocs: 0,
        errorMessage: null,
        startedAt: new Date('2026-09-05T12:00:00.000Z'),
        completedAt: new Date('2026-09-05T12:01:00.000Z'),
      },
    ]);

    const res = await invoke('sefaz-auto-sync');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.source).toBe('sync_log');
    expect(body.items).toHaveLength(1);
    expect(body.items[0].syncMethod).toBe('sefaz');
    expect(mocks.syncLogFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { syncMethod: { in: ['sefaz'] } },
      }),
    );
  });

  it('retorna source none sem consultar SyncLog para rotina sem trilha', async () => {
    mocks.requireAuth.mockResolvedValueOnce('user-admin');
    mocks.userFindUnique.mockResolvedValueOnce({ role: 'admin', allowedPages: [] });
    const res = await invoke('postgres-backup');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.source).toBe('none');
    expect(body.items).toEqual([]);
    expect(body.unavailableReason).toMatch(/não persiste/i);
    expect(mocks.syncLogFindMany).not.toHaveBeenCalled();
  });
});

describe('Rotinas UI contract (FR-009)', () => {
  it('page-client abre popup e remove colunas Categoria/Lock da listagem', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/app/(painel)/sistema/rotinas/page-client.tsx'),
      'utf8',
    );
    expect(source).toMatch(/RoutineDetailModal/);
    expect(source).not.toMatch(/<th[^>]*>\s*Categoria\s*<\/th>/);
    expect(source).not.toMatch(/<th[^>]*>\s*Lock\s*<\/th>/);
  });

  it('RoutineDetailModal expõe abas Detalhes e Histórico', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/app/(painel)/sistema/rotinas/RoutineDetailModal.tsx'),
      'utf8',
    );
    expect(source).toMatch(/CardDetailPopupModal/);
    expect(source).toMatch(/role="tablist"/);
    expect(source).toMatch(/Histórico/);
    expect(source).toMatch(/\/api\/sistema\/rotinas\/\$\{/);
  });
});
