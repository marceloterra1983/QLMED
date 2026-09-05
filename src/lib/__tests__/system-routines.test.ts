import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  SYSTEM_ROUTINES,
  ROUTINE_CATEGORIES,
  ROUTINE_PAGE_SECTION_ORDER,
  enrichRoutinesWithHealth,
  buildRoutineSummary,
  groupRoutinesByPageSection,
  pageSectionForRoutine,
} from '@/lib/system-routines';
import type { BackgroundServiceName } from '@/lib/background-service-health';
import { DOCUMENTOS_INGEST_INTERVAL_MS, DOCUMENTOS_ALERT_THRESHOLDS } from '@/lib/documentos/constants';
import { IMPCG_INGEST_INTERVAL_MS } from '@/lib/impcg/constants';
import { CASSEMS_INGEST_INTERVAL_MS } from '@/lib/cassems/constants';
import { canAccessApi, PAGE_GROUPS } from '@/lib/navigation';

describe('System Routines Catalog', () => {
  it('contém exatamente 19 rotinas catalogadas', () => {
    expect(SYSTEM_ROUTINES).toHaveLength(20);
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

  it('enrichRoutinesWithHealth aplica telemetria ao vivo nos background services', () => {
    const health = {
      'auto-sync': {
        status: 'running' as const,
        startedAt: '2026-09-04T10:00:00.000Z',
        lastHeartbeatAt: '2026-09-04T10:05:00.000Z',
        lastHeartbeatAgeMs: 5000,
        staleAfterMs: 120000,
        lastError: null,
      },
    };

    const enriched = enrichRoutinesWithHealth(health);
    const sefaz = enriched.find((r) => r.id === 'sefaz-auto-sync');
    expect(sefaz?.liveStatus).toBe('running');
    expect(sefaz?.lastHeartbeatAt).toBe('2026-09-04T10:05:00.000Z');

    const worker = enriched.find((r) => r.id === 'n8n-stuck-watchdog');
    expect(worker?.liveStatus).toBe('worker');
  });

  it('buildRoutineSummary expõe contadores total, backgroundServices, scheduledTimers e watchdogs', () => {
    const summary = buildRoutineSummary(SYSTEM_ROUTINES, { 'auto-sync': { status: 'running' } as any });
    expect(summary.total).toBe(20);
    expect(summary.backgroundServices).toBe(1);
    expect(summary.scheduledTimers).toBeGreaterThan(0);
    expect(summary.watchdogs).toBeGreaterThanOrEqual(2);
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
    expect(byId['unimed-cg-mail-ingest'].frequency).toMatch(/15 minutos/i);

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

    const outboxCron = readFileSync(resolve(process.cwd(), 'scripts/install-notification-outbox-cron.sh'), 'utf8');
    expect(outboxCron).toMatch(/\*\/10 \* \* \* \* \/usr\/bin\/python3 \/srv\/qlmed\/services\/notification-outbox\/worker\.py/);
    expect(byId['notification-outbox-worker'].frequency).toMatch(/10 minutos/i);
    expect(byId['notification-outbox-worker'].frequency).not.toMatch(/1 minuto/);
  });

  it('locks, módulo ANVISA e heartbeat auto-sync batem com o código (FR-006)', () => {
    const byId = Object.fromEntries(SYSTEM_ROUTINES.map((r) => [r.id, r]));
    const lockSrc = readFileSync(resolve(process.cwd(), 'src/lib/postgres-advisory-lock.ts'), 'utf8');

    expect(lockSrc).toMatch(/export function impcgMailIngestLockKey/);
    expect(lockSrc).not.toMatch(/export function impcgIngestLockKey/);
    expect(byId['impcg-mail-ingest'].concurrencyLock).toMatch(/impcgMailIngestLockKey/);
    expect(byId['impcg-mail-ingest'].concurrencyLock).not.toMatch(/impcgIngestLockKey/);

    expect(lockSrc).toMatch(/export function cassemsMailIngestLockKey/);
    expect(lockSrc).not.toMatch(/export function cassemsIngestLockKey/);
    expect(byId['cassems-mail-ingest'].concurrencyLock).toMatch(/cassemsMailIngestLockKey/);
    expect(byId['unimed-cg-mail-ingest'].concurrencyLock).toMatch(/unimedCgMailIngestLockKey/);
    expect(byId['cassems-mail-ingest'].concurrencyLock).not.toMatch(/cassemsIngestLockKey/);

    expect(existsSync(resolve(process.cwd(), 'src/lib/anvisa'))).toBe(false);
    expect(byId['anvisa-registry-sync'].sourceModule).toMatch(/anvisa-api\.ts/);
    expect(byId['anvisa-registry-sync'].sourceModule).not.toMatch(/src\/lib\/anvisa\//);
    expect(byId['anvisa-registry-sync'].scheduleDetails).not.toMatch(/importação de XMLs/i);
    expect(byId['anvisa-registry-sync'].description).not.toMatch(/enriquecimento de produtos importados/i);

    const sharedAutoSync = ['sefaz-auto-sync', 'nsdocs-auto-sync', 'receita-nfse-sync', 'stuck-sync-recovery'];
    for (const id of sharedAutoSync) {
      expect(byId[id].backgroundServiceName).toBe('auto-sync');
      expect(byId[id].scheduleDetails).toMatch(/heartbeat compartilhado|telemetria compartilhada/i);
    }
  });

  it('cada sourceModule aponta para ficheiro que existe no repo', () => {
    for (const routine of SYSTEM_ROUTINES) {
      const parts = routine.sourceModule
        .split(/\s+\/\s+/)
        .map((part) => part.replace(/\s*\([^)]*\)\s*$/, '').trim())
        .filter(Boolean);
      expect(parts.length, routine.id).toBeGreaterThan(0);
      for (const part of parts) {
        expect(existsSync(resolve(process.cwd(), part)), `${routine.id}: ${part}`).toBe(true);
      }
    }
  });

  it('/api/sistema/rotinas só abre com a página Rotinas', () => {
    expect(canAccessApi('viewer', ['/sistema/rotinas'], '/api/sistema/rotinas')).toBe(true);
    expect(canAccessApi('viewer', ['/fiscal/invoices'], '/api/sistema/rotinas')).toBe(false);
    expect(canAccessApi('viewer', ['/sistema/automacoes'], '/api/sistema/rotinas')).toBe(false);
  });

  it('agrupa rotinas pelas seções de PAGE_GROUPS sem duplicar nem perder', () => {
    const menuSections = PAGE_GROUPS.map((g) => g.section);
    expect(ROUTINE_PAGE_SECTION_ORDER.slice(0, -1)).toEqual(menuSections);
    expect(ROUTINE_PAGE_SECTION_ORDER.at(-1)).toBe('Outros');

    const grouped = groupRoutinesByPageSection(SYSTEM_ROUTINES);
    const flat = grouped.flatMap((g) => g.routines);
    expect(flat).toHaveLength(SYSTEM_ROUTINES.length);
    expect(new Set(flat.map((r) => r.id)).size).toBe(SYSTEM_ROUTINES.length);
    expect(grouped.every((g) => g.routines.length > 0)).toBe(true);
    expect(grouped.some((g) => g.section === 'Outros')).toBe(false);

    expect(pageSectionForRoutine({ id: 'documentos-ingest' })).toBe('Cadastros');
    expect(pageSectionForRoutine({ id: 'sefaz-auto-sync' })).toBe('Fiscal');
    expect(pageSectionForRoutine({ id: 'product-aggregate-rebuild' })).toBe('Estoque');
    expect(pageSectionForRoutine({ id: 'daily-summary-catchup' })).toBe('Financeiro');
    expect(pageSectionForRoutine({ id: 'impcg-mail-ingest' })).toBe('Gestão');
    expect(pageSectionForRoutine({ id: 'postgres-backup' })).toBe('Sistema');
    expect(pageSectionForRoutine({ id: 'rotina-fantasma' })).toBe('Outros');
  });

  it('página Rotinas usa Section colapsável iniciando recolhida', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/app/(painel)/sistema/rotinas/page-client.tsx'),
      'utf8',
    );
    expect(source).toMatch(/groupRoutinesByPageSection/);
    expect(source).toMatch(/defaultOpen=\{false\}/);
    expect(source).toMatch(/from '@\/components\/ui\/Section'/);
  });
});
