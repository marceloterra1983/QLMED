export type BackgroundServiceName =
  | 'auto-sync'
  | 'local-xml-sync'
  | 'impcg-mail-ingest'
  | 'cassems-mail-ingest'
  | 'unimed-cg-mail-ingest'
  | 'documentos-ingest'
  | 'documentos-alert'
  | 'notification-outbox-purge';

export interface BackgroundServiceStatus {
  status: 'running' | 'stale' | 'disabled' | 'error';
  startedAt: string;
  lastHeartbeatAt: string | null;
  /** Idade do último heartbeat na hora da leitura. Null quando nunca bateu. */
  lastHeartbeatAgeMs: number | null;
  /** Idade a partir da qual o serviço é declarado `stale`. */
  staleAfterMs: number;
  lastError: string | null;
}

/** Estado guardado; `status` aqui nunca é 'stale' — stale é derivado na leitura. */
interface HealthRecord {
  status: 'running' | 'disabled' | 'error';
  startedAt: string;
  lastHeartbeatAt: string | null;
  heartbeatIntervalMs: number;
  lastError: string | null;
}

type HealthStore = Partial<Record<BackgroundServiceName, HealthRecord>>;

const DEFAULT_HEARTBEAT_INTERVAL_MS = 60_000;
// Um ciclo pode atrasar por lentidão normal; dois ciclos perdidos é avaria.
const STALE_CYCLES = 2;

const globalForHealth = globalThis as typeof globalThis & {
  __qlmedBackgroundServiceHealth?: HealthStore;
};

function store(): HealthStore {
  return (globalForHealth.__qlmedBackgroundServiceHealth ??= {});
}

function staleAfter(record: HealthRecord): number {
  return record.heartbeatIntervalMs * STALE_CYCLES;
}

export function markBackgroundServiceStarted(
  name: BackgroundServiceName,
  options: { enabled?: boolean; heartbeatIntervalMs?: number } = {},
): void {
  const now = new Date().toISOString();
  const interval = Number(options.heartbeatIntervalMs);
  store()[name] = {
    status: options.enabled === false ? 'disabled' : 'running',
    startedAt: now,
    lastHeartbeatAt: now,
    heartbeatIntervalMs: Number.isFinite(interval) && interval > 0 ? interval : DEFAULT_HEARTBEAT_INTERVAL_MS,
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

/**
 * Redige o VALOR de credenciais, não o nome. `accessToken=segredo` vira
 * `accessToken=[redacted]`; o identificador fica para diagnóstico.
 * Cobre `=`, `:` e JSON `": "` / `":"`, com e sem aspas.
 */
export function sanitizeError(message: string): string {
  return message
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
    .replace(
      /\b(access_token|accessToken|refresh_token|refreshToken|api_key|apiKey|client_secret|clientSecret|password|Authorization)\b"?\s*[:=]\s*(?:"[^"]*"|'[^']*'|Bearer\s+\S+|\S+)/gi,
      '$1=[redacted]',
    )
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/eyJ[a-zA-Z0-9_-]{10,}/g, '[token]')
    .slice(0, 500);
}

export function markBackgroundServiceError(name: BackgroundServiceName, error: unknown): void {
  const current = store()[name];
  if (!current) markBackgroundServiceStarted(name);
  const status = store()[name];
  if (!status) return;
  status.status = 'error';
  const raw = error instanceof Error ? error.message : String(error);
  status.lastError = sanitizeError(raw);
}

/**
 * Heartbeat só é sinal se souber envelhecer: um serviço 'running' cujo último
 * batimento passou de `staleAfterMs` é reportado como 'stale' na leitura, sem
 * depender de ninguém escrever nada. Serviço 'disabled' ou 'error' mantém o
 * próprio estado — não há batimento a envelhecer.
 */
export function getBackgroundServiceHealth(now: number = Date.now()): Partial<Record<BackgroundServiceName, BackgroundServiceStatus>> {
  return Object.fromEntries(
    Object.entries(store()).map(([name, record]) => {
      if (!record) return [name, record];
      const beatAt = record.lastHeartbeatAt ? Date.parse(record.lastHeartbeatAt) : NaN;
      const ageMs = Number.isFinite(beatAt) ? Math.max(0, now - beatAt) : null;
      const threshold = staleAfter(record);
      const status = record.status === 'running' && ageMs !== null && ageMs > threshold
        ? 'stale'
        : record.status;

      return [name, {
        status,
        startedAt: record.startedAt,
        lastHeartbeatAt: record.lastHeartbeatAt,
        lastHeartbeatAgeMs: ageMs,
        staleAfterMs: threshold,
        lastError: record.lastError,
      } satisfies BackgroundServiceStatus];
    }),
  ) as Partial<Record<BackgroundServiceName, BackgroundServiceStatus>>;
}
