import { describe, expect, it, vi } from 'vitest';
import { checkRateLimit } from '../rate-limit';
import {
  allowsRouteLevelApiKeyAuth,
  getClientIp,
  getRateLimitConfig,
} from '../../middleware';

describe('rate limit helpers', () => {
  it('blocks after the configured limit until the window expires', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    const key = `test:${Math.random()}`;

    expect(checkRateLimit(key, { interval: 1000, maxRequests: 2 }).allowed).toBe(true);
    expect(checkRateLimit(key, { interval: 1000, maxRequests: 2 }).allowed).toBe(true);
    expect(checkRateLimit(key, { interval: 1000, maxRequests: 2 }).allowed).toBe(false);

    vi.setSystemTime(new Date('2026-01-01T00:00:01.001Z'));
    expect(checkRateLimit(key, { interval: 1000, maxRequests: 2 }).allowed).toBe(true);
    vi.useRealTimers();
  });

  it('limits credentials callback separately from session and csrf endpoints', () => {
    expect(getRateLimitConfig('/api/auth/callback/credentials')).not.toBeNull();
    expect(getRateLimitConfig('/api/auth/session')).toBeNull();
    expect(getRateLimitConfig('/api/auth/csrf')).toBeNull();
  });

  it('uses the last valid forwarded IP and can ignore proxy headers by env', () => {
    const headers = new Headers({
      'x-forwarded-for': '198.51.100.10, 203.0.113.20',
      'x-real-ip': '192.0.2.30',
    });

    expect(getClientIp(headers)).toBe('203.0.113.20');

    vi.stubEnv('TRUST_PROXY_HEADERS', 'false');
    expect(getClientIp(headers)).toBe('untrusted-proxy');
    vi.unstubAllEnvs();
  });

  it('passes notification worker API keys to route-level scope checks', () => {
    expect(allowsRouteLevelApiKeyAuth('/api/notifications/outbox/smoke')).toBe(true);
    expect(allowsRouteLevelApiKeyAuth('/api/notifications/outbox/claim')).toBe(true);
    expect(allowsRouteLevelApiKeyAuth('/api/admin/api-keys')).toBe(false);
  });
});
