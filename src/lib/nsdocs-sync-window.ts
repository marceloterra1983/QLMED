const DAY_MS = 24 * 60 * 60 * 1000;

export function getNsdocsSyncWindow(lastSyncAt?: Date | null, defaultLookbackDays = 30): {
  dtInicial: string;
  dtFinal: string;
  syncedAt: Date;
} {
  const syncedAt = new Date();
  const startDate = lastSyncAt ? new Date(lastSyncAt) : new Date(syncedAt);

  if (lastSyncAt) {
    // Reprocessa 1 dia para evitar perda por fuso/atraso de indexação.
    startDate.setDate(startDate.getDate() - 1);
  } else {
    startDate.setDate(startDate.getDate() - defaultLookbackDays);
  }

  if (startDate > syncedAt) {
    startDate.setTime(syncedAt.getTime() - DAY_MS);
  }

  return {
    dtInicial: startDate.toISOString().split('T')[0],
    dtFinal: syncedAt.toISOString().split('T')[0],
    syncedAt,
  };
}
