import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';
import { RATE_LIMITS, checkRateLimit } from '../rate-limit';
import {
  allowsRouteLevelApiKeyAuth,
  getClientIp,
  getRateLimitConfig,
  middleware,
} from '../../middleware';

/**
 * REAUD-B-16. `findUserByPassword` compara bcrypt contra TODOS os
 * utilizadores por tentativa (ADR-0012: a senha é a identidade). Medido a
 * custo 12 com bcryptjs: 185 ms por compare. O teto de CPU por minuto é
 * N × loginGlobal × 0,185 s; com 120 e 10 utilizadores eram 222 s — mais de
 * três threads que o Node não tem.
 */
describe('teto global de login (REAUD-B-16)', () => {
  it('prende loginGlobal ao orçamento de bcrypt (≤ 20/min)', () => {
    expect(RATE_LIMITS.loginGlobal.maxRequests).toBeLessThanOrEqual(20);
  });

  it('o middleware corta com 429 antes de o authorize correr, mesmo com IPs distintos', async () => {
    const attempt = (ip: string) =>
      middleware(
        new NextRequest('http://localhost/api/auth/callback/credentials', {
          method: 'POST',
          headers: { 'x-forwarded-for': ip },
        }),
      );
    const max = RATE_LIMITS.loginGlobal.maxRequests;

    // Cada IP é novo (fica abaixo do limite por IP); só o balde global conta.
    for (let i = 0; i < max; i++) {
      expect((await attempt(`198.51.100.${i}`)).status).toBe(200);
    }

    expect((await attempt('198.51.100.250')).status).toBe(429);
  });
});

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

  // AUTH-009
  describe('getClientIp — origem do endereço', () => {
    it('prefere CF-Connecting-IP, que a Cloudflare reescreve e o cliente não forja', () => {
      const headers = new Headers({
        'cf-connecting-ip': '198.51.100.77',
        // O atacante pode enfiar o que quiser aqui; não deve ganhar.
        'x-forwarded-for': '10.0.0.1, 10.0.0.2',
        'x-real-ip': '192.0.2.30',
      });
      expect(getClientIp(headers)).toBe('198.51.100.77');
    });

    it('conta TRUST_PROXY_HOPS a partir da direita', () => {
      const headers = new Headers({
        // cliente real = 198.51.100.10; dois proxies acrescentaram à direita
        'x-forwarded-for': '198.51.100.10, 203.0.113.20, 203.0.113.21',
      });
      vi.stubEnv('TRUST_PROXY_HOPS', '2');
      expect(getClientIp(headers)).toBe('203.0.113.20');
      vi.stubEnv('TRUST_PROXY_HOPS', '3');
      expect(getClientIp(headers)).toBe('198.51.100.10');
      vi.unstubAllEnvs();
    });

    it('não aceita uma cadeia mais curta do que os saltos declarados', () => {
      // Dois proxies declarados, mas só um endereço na cadeia: quem escreveu
      // esse header não foram os proxies. Cai para x-real-ip.
      const headers = new Headers({
        'x-forwarded-for': '10.0.0.1',
        'x-real-ip': '192.0.2.30',
      });
      vi.stubEnv('TRUST_PROXY_HOPS', '2');
      expect(getClientIp(headers)).toBe('192.0.2.30');
      vi.unstubAllEnvs();
    });

    it('TRUST_PROXY_HEADERS=false recusa também o CF-Connecting-IP', () => {
      const headers = new Headers({ 'cf-connecting-ip': '198.51.100.77' });
      vi.stubEnv('TRUST_PROXY_HEADERS', 'false');
      expect(getClientIp(headers)).toBe('untrusted-proxy');
      vi.unstubAllEnvs();
    });
  });

  it('passes notification worker API keys to route-level scope checks', () => {
    expect(allowsRouteLevelApiKeyAuth('/api/notifications/outbox/smoke')).toBe(true);
    expect(allowsRouteLevelApiKeyAuth('/api/notifications/outbox/claim')).toBe(true);
    expect(allowsRouteLevelApiKeyAuth('/api/admin/api-keys')).toBe(false);
  });
});
