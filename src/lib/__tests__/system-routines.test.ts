import { describe, expect, it, vi, beforeEach } from 'vitest';
import { SYSTEM_ROUTINES, ROUTINE_CATEGORIES } from '@/lib/system-routines';
import type { BackgroundServiceName } from '@/lib/background-service-health';

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  syncLogCount: vi.fn().mockResolvedValue(42),
  notificationDeliveryCount: vi.fn().mockResolvedValue(3),
  getBackgroundServiceHealth: vi.fn().mockReturnValue({
    'auto-sync': {
      status: 'running',
      startedAt: '2026-09-04T10:00:00.000Z',
      lastHeartbeatAt: '2026-09-04T10:05:00.000Z',
      lastHeartbeatAgeMs: 5000,
      staleAfterMs: 120000,
      lastError: null,
    },
  }),
}));

vi.mock('@/lib/auth', () => ({
  requireAuth: mocks.requireAuth,
}));

vi.mock('@/lib/prisma', () => ({
  default: {
    syncLog: {
      count: mocks.syncLogCount,
    },
    notificationDelivery: {
      count: mocks.notificationDeliveryCount,
    },
  },
}));

vi.mock('@/lib/background-service-health', () => ({
  getBackgroundServiceHealth: mocks.getBackgroundServiceHealth,
}));

import { GET } from '@/app/api/sistema/rotinas/route';

describe('System Routines Catalog', () => {
  it('contém pelo menos 18 rotinas catalogadas', () => {
    expect(SYSTEM_ROUTINES.length).toBeGreaterThanOrEqual(18);
  });

  it('toda rotina possui identificador único e campos obrigatórios preenchidos', () => {
    const ids = new Set<string>();
    for (const r of SYSTEM_ROUTINES) {
      expect(ids.has(r.id), `ID duplicado detectado: ${r.id}`).toBe(false);
      ids.add(r.id);

      expect(r.name.trim().length).toBeGreaterThan(0);
      expect(r.description.trim().length).toBeGreaterThan(0);
      expect(r.frequency.trim().length).toBeGreaterThan(0);
      expect(r.scheduleDetails.trim().length).toBeGreaterThan(0);
      expect(r.concurrencyLock.trim().length).toBeGreaterThan(0);
      expect(r.sourceModule.trim().length).toBeGreaterThan(0);
      expect(ROUTINE_CATEGORIES[r.category], `Categoria inválida: ${r.category}`).toBeDefined();
    }
  });

  it('cobre todos os BackgroundServiceName declarados no background-service-health', () => {
    const expectedServices: BackgroundServiceName[] = [
      'auto-sync',
      'local-xml-sync',
      'impcg-mail-ingest',
      'cassems-mail-ingest',
      'documentos-ingest',
      'documentos-alert',
      'notification-outbox-purge',
    ];

    const mappedServices = new Set(
      SYSTEM_ROUTINES.map((r) => r.backgroundServiceName).filter(Boolean),
    );

    for (const svc of expectedServices) {
      expect(mappedServices.has(svc), `Serviço ${svc} não está mapeado no catálogo de rotinas`).toBe(true);
    }
  });

  it('possui rotinas de todas as categorias do sistema', () => {
    const categoriesInUse = new Set(SYSTEM_ROUTINES.map((r) => r.category));
    for (const cat of Object.keys(ROUTINE_CATEGORIES)) {
      expect(categoriesInUse.has(cat as any), `Categoria ${cat} sem nenhuma rotina mapeada`).toBe(true);
    }
  });
});

describe('GET /api/sistema/rotinas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejeita com 401 quando requireAuth falha', async () => {
    mocks.requireAuth.mockRejectedValueOnce(new Error('Unauthorized'));

    const response = await GET();
    expect(response.status).toBe(401);

    const body = await response.json();
    expect(body.success).toBe(false);
  });

  it('retorna a lista de rotinas enriquecida com status ao vivo e resumo', async () => {
    mocks.requireAuth.mockResolvedValueOnce({ id: 'u1', role: 'admin' });

    const response = await GET();
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.routines)).toBe(true);
    expect(body.routines.length).toBe(SYSTEM_ROUTINES.length);

    // Confere se auto-sync foi enriquecido com o status running do mock
    const autoSync = body.routines.find((r: any) => r.id === 'sefaz-auto-sync');
    expect(autoSync).toBeDefined();
    expect(autoSync.liveStatus).toBe('running');
    expect(autoSync.lastHeartbeatAt).toBe('2026-09-04T10:05:00.000Z');

    expect(body.summary.totalRoutines).toBe(SYSTEM_ROUTINES.length);
    expect(body.summary.activeServicesCount).toBe(1);
    expect(body.summary.recentSyncs24h).toBe(42);
    expect(body.summary.pendingOutbox).toBe(3);
  });
});
