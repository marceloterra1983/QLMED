import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { SYSTEM_ROUTINES, ROUTINE_CATEGORIES } from '@/lib/system-routines';
import type { BackgroundServiceName } from '@/lib/background-service-health';
import { DOCUMENTOS_INGEST_INTERVAL_MS, DOCUMENTOS_ALERT_THRESHOLDS } from '@/lib/documentos/constants';
import { IMPCG_INGEST_INTERVAL_MS } from '@/lib/impcg/constants';
import { CASSEMS_INGEST_INTERVAL_MS } from '@/lib/cassems/constants';
import { canAccessApi } from '@/lib/navigation';

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
      expect(categoriesInUse.has(cat as keyof typeof ROUTINE_CATEGORIES), `Categoria ${cat} sem nenhuma rotina mapeada`).toBe(true);
    }
  });

  it('a frequência publicada bate com as constantes e timers do código', () => {
    const byId = Object.fromEntries(SYSTEM_ROUTINES.map((r) => [r.id, r]));

    expect(DOCUMENTOS_INGEST_INTERVAL_MS).toBe(60 * 60 * 1000);
    expect(byId['documentos-ingest'].frequency).toMatch(/1 hora/i);
    expect(byId['documentos-ingest'].frequency).not.toMatch(/10 minutos/i);
    expect(byId['documentos-ingest'].scheduleDetails).toMatch(/3600|1 hora/i);

    expect(IMPCG_INGEST_INTERVAL_MS).toBe(15 * 60 * 1000);
    expect(CASSEMS_INGEST_INTERVAL_MS).toBe(15 * 60 * 1000);
    expect(byId['impcg-mail-ingest'].frequency).toMatch(/15 minutos/i);
    expect(byId['cassems-mail-ingest'].frequency).toMatch(/15 minutos/i);

    expect(DOCUMENTOS_ALERT_THRESHOLDS).toEqual([30, 15, 7, 3, 1, 0]);
    expect(byId['documentos-alert'].description).toMatch(/30, 15, 7, 3, 1, 0/);

    expect(byId['sefaz-auto-sync'].frequency).toMatch(/6 horas|360 min/i);
    expect(byId['sefaz-auto-sync'].frequency).not.toMatch(/A cada 1 hora$/);

    expect(byId['onedrive-xml-sync'].frequency).toMatch(/1 min/i);
    expect(byId['onedrive-xml-sync'].frequency).not.toMatch(/5 min/i);

    const cteTimer = readFileSync(resolve(process.cwd(), 'ops/systemd/qlmed-cte-dist-sync.timer'), 'utf8');
    expect(cteTimer).toMatch(/\*:17:00/);
    expect(byId['cte-dist-sync'].frequency).toMatch(/hora|:17/i);
    expect(byId['cte-dist-sync'].frequency).not.toMatch(/2 horas/i);

    const n8nTimer = readFileSync(resolve(process.cwd(), 'ops/systemd/qlmed-n8n-stuck-watchdog.timer'), 'utf8');
    expect(n8nTimer).toMatch(/OnUnitActiveSec=2min/);
    expect(byId['n8n-stuck-watchdog'].frequency).toMatch(/2 minutos/i);
    expect(byId['n8n-stuck-watchdog'].frequency).not.toMatch(/10 minutos/i);

    const summaryTimer = readFileSync(resolve(process.cwd(), 'ops/systemd/qlmed-daily-summary-catchup.timer'), 'utf8');
    expect(summaryTimer).toMatch(/OnUnitActiveSec=15min/);
    expect(byId['daily-summary-catchup'].frequency).toMatch(/15 min/i);
    expect(byId['daily-summary-catchup'].scheduleDetails).toMatch(/18h|Campo_Grande/i);
    expect(byId['daily-summary-catchup'].frequency).not.toMatch(/19:30/);

    expect(byId['postgres-backup'].frequency).not.toMatch(/02:00/);
    expect(byId['postgres-backup'].frequency).toMatch(/fallback|sob demanda/i);

    const rebuildSrc = readFileSync(resolve(process.cwd(), 'src/lib/product-aggregate-updater.ts'), 'utf8');
    expect(rebuildSrc).toMatch(/setHours\(3, 0, 0, 0\)/);
    expect(byId['product-aggregate-rebuild'].frequency).toMatch(/03:00/);

    const evoTimer = readFileSync(resolve(process.cwd(), 'ops/systemd/qlmed-evolution-session-monitor.timer'), 'utf8');
    expect(evoTimer).toMatch(/OnUnitActiveSec=5min/);
    expect(byId['evolution-session-watchdog'].frequency).toMatch(/5 minutos/i);
  });

  it('/api/sistema/rotinas só abre com a página Rotinas', () => {
    expect(canAccessApi('viewer', ['/sistema/rotinas'], '/api/sistema/rotinas')).toBe(true);
    expect(canAccessApi('viewer', ['/fiscal/invoices'], '/api/sistema/rotinas')).toBe(false);
    expect(canAccessApi('viewer', ['/sistema/automacoes'], '/api/sistema/rotinas')).toBe(false);
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
