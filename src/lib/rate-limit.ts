export interface RateLimitConfig {
  interval: number;   // Time window in milliseconds (e.g., 60000 for 1 min)
  maxRequests: number; // Max requests per window
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();
let callCount = 0;

function cleanup() {
  const now = Date.now();
  for (const [key, entry] of Array.from(store.entries())) {
    if (now > entry.resetAt) {
      store.delete(key);
    }
  }
}

export function checkRateLimit(key: string, config: RateLimitConfig): RateLimitResult {
  callCount++;
  if (callCount % 100 === 0) {
    cleanup();
  }

  const now = Date.now();
  const entry = store.get(key);

  // No entry or expired window — start fresh
  if (!entry || now > entry.resetAt) {
    const resetAt = now + config.interval;
    store.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: config.maxRequests - 1, resetAt };
  }

  // Within window and under limit
  if (entry.count < config.maxRequests) {
    entry.count++;
    return { allowed: true, remaining: config.maxRequests - entry.count, resetAt: entry.resetAt };
  }

  // Over limit
  return { allowed: false, remaining: 0, resetAt: entry.resetAt };
}

export function getRateLimitHeaders(remaining: number, resetAt: number): Record<string, string> {
  return {
    'X-RateLimit-Remaining': String(remaining),
    'X-RateLimit-Reset': String(Math.ceil(resetAt / 1000)),
  };
}

export const RATE_LIMITS = {
  login: { interval: 60_000, maxRequests: 5 },
  upload: { interval: 60_000, maxRequests: 10 },
  webhook: { interval: 60_000, maxRequests: 60 },
} as const satisfies Record<string, RateLimitConfig>;
