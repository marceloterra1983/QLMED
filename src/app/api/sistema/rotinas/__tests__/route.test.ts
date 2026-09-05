import { describe, expect, it, vi, beforeEach } from 'vitest';
import { SYSTEM_ROUTINES } from '@/lib/system-routines';

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
  unauthorizedResponse: () =>
    new Response(JSON.stringify({ error: 'Não autorizado' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    }),
}));

vi.mock('@/lib/prisma', () => ({
  default: {
    syncLog: { count: mocks.syncLogCount },
    notificationDelivery: { count: mocks.notificationDeliveryCount },
  },
}));

vi.mock('@/lib/background-service-health', () => ({
  getBackgroundServiceHealth: mocks.getBackgroundServiceHealth,
}));

import { GET } from '../route';

describe('GET /api/sistema/rotinas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejeita com 401 quando requireAuth falha', async () => {
    mocks.requireAuth.mockRejectedValueOnce(new Error('NOT_AUTHENTICATED'));

    const response = await GET();
    expect(response.status).toBe(401);

    const body = await response.json();
    expect(body.error).toBe('Não autorizado');
  });

  it('retorna rotinas enriquecidas, summary canônico e telemetria', async () => {
    mocks.requireAuth.mockResolvedValueOnce('user-1');

    const response = await GET();
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.routines).toHaveLength(SYSTEM_ROUTINES.length);

    const autoSync = body.routines.find((r: { id: string }) => r.id === 'sefaz-auto-sync');
    expect(autoSync?.liveStatus).toBe('running');
    expect(autoSync?.lastHeartbeatAt).toBe('2026-09-04T10:05:00.000Z');

    expect(body.summary.total).toBe(SYSTEM_ROUTINES.length);
    expect(body.summary.totalRoutines).toBe(SYSTEM_ROUTINES.length);
    expect(body.summary.backgroundServices).toBe(1);
    expect(body.summary.scheduledTimers).toBeGreaterThan(0);
    expect(body.summary.watchdogs).toBeGreaterThanOrEqual(2);
    expect(body.summary.activeServicesCount).toBe(1);
    expect(body.summary.recentSyncs24h).toBe(42);
    expect(body.summary.pendingOutbox).toBe(3);
  });
});
