import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  executeWithRetry,
  fetchWithResilience,
  isNetworkTransientError,
  isTransientHttpStatus,
  parseRetryAfterHeader,
} from '@/lib/resilience';

describe('resilience engine (Paper #5 - CORAL)', () => {
  describe('parseRetryAfterHeader', () => {
    it('parses numeric seconds', () => {
      expect(parseRetryAfterHeader('120')).toBe(120);
      expect(parseRetryAfterHeader('0')).toBe(0);
      expect(parseRetryAfterHeader('  45  ')).toBe(45);
    });

    it('returns undefined for invalid or empty values', () => {
      expect(parseRetryAfterHeader(null)).toBeUndefined();
      expect(parseRetryAfterHeader('')).toBeUndefined();
      expect(parseRetryAfterHeader('not-a-number-or-date')).toBeUndefined();
    });

    it('parses HTTP date string into seconds from now', () => {
      const future = new Date(Date.now() + 60_000).toUTCString();
      const seconds = parseRetryAfterHeader(future);
      expect(seconds).toBeGreaterThanOrEqual(58);
      expect(seconds).toBeLessThanOrEqual(62);
    });
  });

  describe('isTransientHttpStatus', () => {
    it('recognizes 429, 502, 503, 504 as transient', () => {
      expect(isTransientHttpStatus(429)).toBe(true);
      expect(isTransientHttpStatus(502)).toBe(true);
      expect(isTransientHttpStatus(503)).toBe(true);
      expect(isTransientHttpStatus(504)).toBe(true);

      expect(isTransientHttpStatus(200)).toBe(false);
      expect(isTransientHttpStatus(400)).toBe(false);
      expect(isTransientHttpStatus(401)).toBe(false);
      expect(isTransientHttpStatus(404)).toBe(false);
      expect(isTransientHttpStatus(500)).toBe(false);
    });
  });

  describe('isNetworkTransientError', () => {
    it('detects connection drops and socket errors', () => {
      expect(isNetworkTransientError(new Error('fetch failed'))).toBe(true);
      expect(isNetworkTransientError(new Error('read ECONNRESET'))).toBe(true);
      expect(isNetworkTransientError(new Error('socket hang up'))).toBe(true);
      expect(isNetworkTransientError(new Error('ETIMEDOUT'))).toBe(true);
      expect(isNetworkTransientError({ code: 'ECONNRESET' })).toBe(true);

      expect(isNetworkTransientError(new Error('SyntaxError'))).toBe(false);
      const abort = new Error('aborted');
      abort.name = 'AbortError';
      expect(isNetworkTransientError(abort)).toBe(false);
    });
  });

  describe('executeWithRetry', () => {
    it('resolves on first try if no errors', async () => {
      const fn = vi.fn().mockResolvedValue('success');
      const result = await executeWithRetry(fn);
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('retries on retryable errors up to maxRetries', async () => {
      let callCount = 0;
      const fn = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount < 3) {
          throw new Error('fetch failed');
        }
        return 'recovered';
      });

      const retries: number[] = [];
      const result = await executeWithRetry(fn, {
        maxRetries: 3,
        baseDelayMs: 1,
        jitter: false,
        onRetry: (_err, attempt) => retries.push(attempt),
      });

      expect(result).toBe('recovered');
      expect(fn).toHaveBeenCalledTimes(3);
      expect(retries).toEqual([1, 2]);
    });

    it('throws immediately on non-retryable error', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('Validation error'));
      await expect(
        executeWithRetry(fn, { maxRetries: 3, baseDelayMs: 1 }),
      ).rejects.toThrow('Validation error');
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  describe('fetchWithResilience', () => {
    const originalFetch = globalThis.fetch;

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it('retries on 429 and succeeds on next attempt', async () => {
      let call = 0;
      globalThis.fetch = vi.fn().mockImplementation(async () => {
        call++;
        if (call === 1) {
          return new Response('Rate limited', {
            status: 429,
            headers: { 'retry-after': '0' },
          });
        }
        return new Response('{"ok":true}', { status: 200 });
      });

      const res = await fetchWithResilience('https://api.example.com', undefined, {
        maxRetries: 2,
        baseDelayMs: 1,
        jitter: false,
      });

      expect(res.status).toBe(200);
      expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    });

    it('returns error response when exhausted', async () => {
      globalThis.fetch = vi.fn().mockImplementation(async () => {
        return new Response('Service Unavailable', { status: 503 });
      });

      const res = await fetchWithResilience('https://api.example.com', undefined, {
        maxRetries: 2,
        baseDelayMs: 1,
        jitter: false,
      });

      expect(res.status).toBe(503);
      expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    });
  });
});
