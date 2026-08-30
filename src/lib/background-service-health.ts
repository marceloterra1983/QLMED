export type BackgroundServiceName = 'auto-sync' | 'local-xml-sync' | 'impcg-mail-ingest' | 'cassems-mail-ingest';

export interface BackgroundServiceStatus {
  status: 'running' | 'disabled' | 'error';
  startedAt: string;
  lastHeartbeatAt: string | null;
  lastError: string | null;
}

type HealthStore = Partial<Record<BackgroundServiceName, BackgroundServiceStatus>>;

const globalForHealth = globalThis as typeof globalThis & {
  __qlmedBackgroundServiceHealth?: HealthStore;
};

function store(): HealthStore {
  return (globalForHealth.__qlmedBackgroundServiceHealth ??= {});
}

export function markBackgroundServiceStarted(
  name: BackgroundServiceName,
  options: { enabled?: boolean } = {},
): void {
  const now = new Date().toISOString();
  store()[name] = {
    status: options.enabled === false ? 'disabled' : 'running',
    startedAt: now,
    lastHeartbeatAt: now,
    lastError: null,
  };
}

export function markBackgroundServiceHeartbeat(name: BackgroundServiceName): void {
  const current = store()[name];
  if (!current) {
    markBackgroundServiceStarted(name);
    return;
  }
  current.lastHeartbeatAt = new Date().toISOString();
  if (current.status === 'error') current.status = 'running';
}

export function markBackgroundServiceError(name: BackgroundServiceName, error: unknown): void {
  const current = store()[name];
  if (!current) markBackgroundServiceStarted(name);
  const status = store()[name];
  if (!status) return;
  status.status = 'error';
  status.lastError = error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500);
}

export function getBackgroundServiceHealth(): HealthStore {
  return Object.fromEntries(
    Object.entries(store()).map(([name, status]) => [name, status ? { ...status } : status]),
  ) as HealthStore;
}
