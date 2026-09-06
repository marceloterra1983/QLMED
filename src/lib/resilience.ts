/**
 * Bounded Resilience & Exponential Jitter Backoff (Paper #5 - CORAL).
 * Unified retry mechanism honoring Retry-After headers, transient status codes (429, 502, 503, 504),
 * and network aborts across external adapters.
 */

export function parseRetryAfterHeader(header: string | null | undefined): number | undefined {
  if (!header) return undefined;
  const trimmed = header.trim();
  if (!trimmed) return undefined;

  const asNumber = Number(trimmed);
  if (Number.isFinite(asNumber) && asNumber >= 0) {
    return asNumber;
  }

  const parsedDate = Date.parse(trimmed);
  if (Number.isFinite(parsedDate)) {
    const diffSec = Math.ceil((parsedDate - Date.now()) / 1000);
    return diffSec > 0 ? diffSec : 0;
  }

  return undefined;
}

export function isTransientHttpStatus(status: number): boolean {
  return status === 429 || status === 502 || status === 503 || status === 504;
}

export function isNetworkTransientError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const err = error as { name?: string; message?: string; code?: string };
  if (err.name === 'AbortError') return false; // Caller-requested abort should not be blindly retried

  const msg = (err.message || '').toLowerCase();
  const code = (err.code || '').toUpperCase();

  return (
    msg.includes('fetch failed') ||
    msg.includes('econnreset') ||
    msg.includes('etimedout') ||
    msg.includes('socket hang up') ||
    msg.includes('network error') ||
    code === 'ECONNRESET' ||
    code === 'ETIMEDOUT' ||
    code === 'ENOTFOUND'
  );
}

export interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  jitter?: boolean;
  signal?: AbortSignal;
  retryOn?: (error: unknown, attempt: number) => boolean;
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
}

function calculateBackoff(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number,
  useJitter: boolean,
  retryAfterSec?: number,
): number {
  if (retryAfterSec !== undefined) {
    return Math.min(retryAfterSec * 1000, maxDelayMs);
  }
  // Exponential backoff: base * 2^(attempt - 1)
  const expDelay = baseDelayMs * Math.pow(2, attempt - 1);
  const capped = Math.min(expDelay, maxDelayMs);
  if (!useJitter) return capped;
  // Full jitter: random between baseDelay and capped
  const jitterOffset = Math.random() * (capped - baseDelayMs);
  return Math.min(Math.floor(baseDelayMs + jitterOffset), maxDelayMs);
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      return reject(signal.reason ?? new Error('Aborted'));
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);

    const onAbort = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      reject(signal.reason ?? new Error('Aborted'));
    };

    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export async function executeWithRetry<T>(
  fn: (attempt: number) => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const maxRetries = options.maxRetries ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 300;
  const maxDelayMs = options.maxDelayMs ?? 5000;
  const jitter = options.jitter ?? true;

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    if (options.signal?.aborted) {
      throw options.signal.reason ?? new Error('Aborted');
    }

    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;

      if (options.signal?.aborted) {
        throw options.signal.reason ?? error;
      }

      if (attempt >= maxRetries) {
        break;
      }

      const shouldRetry = options.retryOn
        ? options.retryOn(error, attempt)
        : isNetworkTransientError(error);

      if (!shouldRetry) {
        throw error;
      }

      const delayMs = calculateBackoff(attempt, baseDelayMs, maxDelayMs, jitter);
      options.onRetry?.(error, attempt, delayMs);
      await sleep(delayMs, options.signal);
    }
  }

  throw lastError;
}

export interface FetchResilienceOptions extends RetryOptions {
  timeoutMs?: number;
  retryOnStatus?: (status: number) => boolean;
}

export async function fetchWithResilience(
  input: string | URL | Request,
  init?: RequestInit,
  options: FetchResilienceOptions = {},
): Promise<Response> {
  const maxRetries = options.maxRetries ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 300;
  const maxDelayMs = options.maxDelayMs ?? 5000;
  const jitter = options.jitter ?? true;
  const shouldRetryStatus = options.retryOnStatus ?? isTransientHttpStatus;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    if (options.signal?.aborted) {
      throw options.signal.reason ?? new Error('Aborted');
    }

    const controller = new AbortController();
    const timer = options.timeoutMs
      ? setTimeout(() => controller.abort(new Error('Request timeout')), options.timeoutMs)
      : null;

    try {
      const mergedSignal = options.signal
        ? AbortSignal.any([options.signal, controller.signal])
        : controller.signal;

      const response = await fetch(input, {
        ...init,
        signal: mergedSignal,
      });

      if (timer) clearTimeout(timer);

      if (shouldRetryStatus(response.status) && attempt < maxRetries) {
        const retryAfterSec = parseRetryAfterHeader(response.headers.get('retry-after'));
        const delayMs = calculateBackoff(attempt, baseDelayMs, maxDelayMs, jitter, retryAfterSec);

        options.onRetry?.(new Error(`HTTP ${response.status}`), attempt, delayMs);

        // Drain response body so connection can be reused
        await response.text().catch(() => '');
        await sleep(delayMs, options.signal);
        continue;
      }

      return response;
    } catch (error) {
      if (timer) clearTimeout(timer);

      if (options.signal?.aborted) {
        throw options.signal.reason ?? error;
      }

      if (attempt >= maxRetries) {
        throw error;
      }

      const shouldRetry = options.retryOn
        ? options.retryOn(error, attempt)
        : isNetworkTransientError(error);

      if (!shouldRetry) {
        throw error;
      }

      const delayMs = calculateBackoff(attempt, baseDelayMs, maxDelayMs, jitter);
      options.onRetry?.(error, attempt, delayMs);
      await sleep(delayMs, options.signal);
    }
  }

  throw new Error('fetchWithResilience: unexpected exhaustion');
}
