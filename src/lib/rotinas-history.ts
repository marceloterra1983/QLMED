import type { SyncMethod } from '@prisma/client';

export type RoutineHistorySource = 'sync_log' | 'none';

export type RoutineHistoryQuery = {
  source: RoutineHistorySource;
  /** Métodos SyncLog a filtrar; null quando source=none. */
  syncMethods: SyncMethod[] | null;
  /** Mensagem amigável quando não há fonte de histórico. */
  unavailableReason: string | null;
};

const SYNC_HISTORY_BY_ROUTINE: Record<string, SyncMethod[]> = {
  'sefaz-auto-sync': ['sefaz'],
  'nsdocs-auto-sync': ['nsdocs'],
  'receita-nfse-sync': ['receita_nfse'],
  // Recuperação atua sobre SyncLog de qualquer método fiscal.
  'stuck-sync-recovery': ['sefaz', 'nsdocs', 'receita_nfse'],
};

/**
 * Fonte de histórico de execução por rotina.
 * Hoje só SyncLog cobre syncs fiscais; demais rotinas ficam sem trilha persistida.
 */
export function routineHistoryQuery(routineId: string): RoutineHistoryQuery {
  const syncMethods = SYNC_HISTORY_BY_ROUTINE[routineId];
  if (syncMethods) {
    return { source: 'sync_log', syncMethods, unavailableReason: null };
  }
  return {
    source: 'none',
    syncMethods: null,
    unavailableReason:
      'Esta rotina ainda não persiste histórico de execução (sem SyncLog associado).',
  };
}
