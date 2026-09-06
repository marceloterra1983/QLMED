import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('daily-issued-summary-job', () => {
  let stateDir: string;

  beforeEach(() => {
    vi.resetModules();
    stateDir = mkdtempSync(join(tmpdir(), 'daily-sum-'));
    process.env.DAILY_SUMMARY_STATE_DIR = stateDir;
    process.env.DAILY_SUMMARY_NATIVE = '1';
    process.env.DAILY_SUMMARY_ALLOW_SEND = '1';
    process.env.NEXTAUTH_URL = 'https://app.qlmed.com.br';
    delete process.env.DAILY_SUMMARY_DRY_RUN;
    process.env.NOTIFICATION_WHATSAPP_GROUP = '120363411914746947@g.us';
    process.env.EVO_API_URL = 'https://evolution.qlmed.com.br';
    process.env.EVO_INSTANCE = 'qlmed';
    process.env.EVO_API_KEY = 'k';
  });

  afterEach(() => {
    rmSync(stateDir, { recursive: true, force: true });
    delete process.env.DAILY_SUMMARY_STATE_DIR;
    delete process.env.DAILY_SUMMARY_ALLOW_SEND;
  });

  it('campoGrandeDayUtcBounds spans 24h', async () => {
    const { campoGrandeDayUtcBounds } = await import('@/lib/daily-issued-summary-message');
    const { start, end } = campoGrandeDayUtcBounds('2026-09-05');
    expect(end.getTime() - start.getTime()).toBe(24 * 60 * 60 * 1000);
  });

  it('skips when native disabled', async () => {
    process.env.DAILY_SUMMARY_NATIVE = '0';
    const mod = await import('@/lib/daily-issued-summary-job');
    mod.__resetDailySummarySentMemory();
    const r = await mod.runDailyIssuedSummary({ now: new Date('2026-09-05T22:00:00.000Z') });
    expect(r.status).toBe('disabled');
  });

  it('refuses preview NEXTAUTH_URL without ALLOW_SEND', async () => {
    delete process.env.DAILY_SUMMARY_ALLOW_SEND;
    process.env.NEXTAUTH_URL = 'http://100.83.11.58:3002';
    const mod = await import('@/lib/daily-issued-summary-job');
    expect(mod.isDailySummarySenderAllowed()).toBe(false);
    mod.__resetDailySummarySentMemory();
    const r = await mod.runDailyIssuedSummary({ now: new Date('2026-09-05T22:00:00.000Z') });
    expect(r.status).toBe('skipped');
    expect(r.reason).toBe('sender-not-production');
  });

  it('allows production NEXTAUTH_URL', async () => {
    delete process.env.DAILY_SUMMARY_ALLOW_SEND;
    process.env.NEXTAUTH_URL = 'https://app.qlmed.com.br';
    const mod = await import('@/lib/daily-issued-summary-job');
    expect(mod.isDailySummarySenderAllowed()).toBe(true);
  });

  it('dry-run builds messages without sending', async () => {
    process.env.DAILY_SUMMARY_DRY_RUN = '1';
    vi.doMock('@/lib/single-company', () => ({
      getSingleCompany: async () => ({ id: 'c1', cnpj: 'x' }),
    }));
    vi.doMock('@/lib/prisma', () => ({
      default: {
        invoice: {
          findMany: async () => [
            {
              number: '1',
              totalValue: 100,
              cfop: '5102',
              cancelledAt: null,
              recipientCnpj: '1',
              recipientName: 'A',
            },
          ],
        },
        contactNickname: { findMany: async () => [] },
        dailyIssuedSummarySend: {
          findUnique: async () => null,
          create: async () => ({}),
          update: async () => ({}),
          deleteMany: async () => ({ count: 0 }),
        },
        $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({}),
      },
    }));
    vi.doMock('@/lib/postgres-advisory-lock', () => ({
      acquirePostgresAdvisoryLock: async () => ({ release: async () => undefined }),
      acquirePostgresTransactionAdvisoryLock: async () => undefined,
    }));
    const send = vi.fn();
    vi.doMock('@/lib/whatsapp-evolution', () => ({
      getEvolutionConfig: () => ({
        baseUrl: 'https://evolution.qlmed.com.br',
        instance: 'qlmed',
        apiKey: 'k',
      }),
      sendWhatsAppText: send,
    }));
    const mod = await import('@/lib/daily-issued-summary-job');
    mod.__resetDailySummarySentMemory();
    const r = await mod.runDailyIssuedSummary({
      now: new Date('2026-09-05T22:00:00.000Z'),
      dryRun: true,
    });
    expect(r.status).toBe('dry_run');
    expect(r.messages.length).toBeGreaterThan(0);
    expect(send).not.toHaveBeenCalled();
  });

  it('markSentOnDisk creates marker', async () => {
    const mod = await import('@/lib/daily-issued-summary-job');
    mod.__resetDailySummarySentMemory();
    expect(mod.readSentDateFromDisk('2026-09-05')).toBe(false);
    mod.markSentOnDisk('2026-09-05');
    expect(mod.readSentDateFromDisk('2026-09-05')).toBe(true);
    expect(existsSync(join(stateDir, 'sent_2026-09-05'))).toBe(true);
  });

  it('skips send when advisory lock not acquired', async () => {
    vi.doMock('@/lib/single-company', () => ({
      getSingleCompany: async () => ({ id: 'c1', cnpj: 'x' }),
    }));
    vi.doMock('@/lib/prisma', () => ({
      default: {
        invoice: { findMany: async () => [] },
        contactNickname: { findMany: async () => [] },
        dailyIssuedSummarySend: {
          findUnique: async () => null,
          create: async () => ({}),
          update: async () => ({}),
          deleteMany: async () => ({ count: 0 }),
        },
        $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
          fn({
            dailyIssuedSummarySend: {
              findUnique: async () => null,
              create: async () => ({}),
            },
          }),
      },
    }));
    vi.doMock('@/lib/postgres-advisory-lock', () => ({
      acquirePostgresAdvisoryLock: async () => null,
      acquirePostgresTransactionAdvisoryLock: async () => undefined,
    }));
    const send = vi.fn();
    vi.doMock('@/lib/whatsapp-evolution', () => ({
      getEvolutionConfig: () => ({
        baseUrl: 'https://evolution.qlmed.com.br',
        instance: 'qlmed',
        apiKey: 'k',
      }),
      sendWhatsAppText: send,
    }));
    const mod = await import('@/lib/daily-issued-summary-job');
    mod.__resetDailySummarySentMemory();
    const r = await mod.runDailyIssuedSummary({ now: new Date('2026-09-05T22:00:00.000Z') });
    expect(r.status).toBe('skipped');
    expect(r.reason).toBe('lock_not_acquired');
    expect(send).not.toHaveBeenCalled();
  });

  it('second claim loses — already_sent without WhatsApp', async () => {
    let claimed = false;
    vi.doMock('@/lib/single-company', () => ({
      getSingleCompany: async () => ({ id: 'c1', cnpj: 'x' }),
    }));
    vi.doMock('@/lib/prisma', () => ({
      default: {
        invoice: { findMany: async () => [] },
        contactNickname: { findMany: async () => [] },
        dailyIssuedSummarySend: {
          findUnique: async () => (claimed ? { sentAt: new Date() } : null),
          create: async () => {
            if (claimed) throw Object.assign(new Error('unique'), { code: 'P2002' });
            claimed = true;
            return {};
          },
          update: async () => ({}),
          deleteMany: async () => ({ count: 0 }),
        },
        $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
          fn({
            dailyIssuedSummarySend: {
              findUnique: async () => (claimed ? { dateISO: '2026-09-05' } : null),
              create: async () => {
                if (claimed) return null;
                claimed = true;
                return {};
              },
            },
          }),
      },
    }));
    vi.doMock('@/lib/postgres-advisory-lock', () => ({
      acquirePostgresAdvisoryLock: async () => ({ release: async () => undefined }),
      acquirePostgresTransactionAdvisoryLock: async () => undefined,
    }));
    const send = vi.fn(async () => undefined);
    vi.doMock('@/lib/whatsapp-evolution', () => ({
      getEvolutionConfig: () => ({
        baseUrl: 'https://evolution.qlmed.com.br',
        instance: 'qlmed',
        apiKey: 'k',
      }),
      sendWhatsAppText: send,
    }));
    const mod = await import('@/lib/daily-issued-summary-job');
    mod.__resetDailySummarySentMemory();
    const first = await mod.runDailyIssuedSummary({ now: new Date('2026-09-05T22:00:00.000Z') });
    expect(first.status).toBe('sent');
    expect(send).toHaveBeenCalledTimes(1);
    mod.__resetDailySummarySentMemory();
    // clear disk so second pass hits DB claim
    rmSync(stateDir, { recursive: true, force: true });
    stateDir = mkdtempSync(join(tmpdir(), 'daily-sum-'));
    process.env.DAILY_SUMMARY_STATE_DIR = stateDir;
    const second = await mod.runDailyIssuedSummary({ now: new Date('2026-09-05T22:05:00.000Z') });
    expect(second.status).toBe('already_sent');
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('isDailySummarySent detects database claim without disk file', async () => {
    vi.doMock('@/lib/prisma', () => ({
      default: {
        dailyIssuedSummarySend: {
          findUnique: async () => ({ sentAt: new Date() }),
        },
      },
    }));
    const mod = await import('@/lib/daily-issued-summary-job');
    mod.__resetDailySummarySentMemory();
    // disk is clean, but DB has sent claim
    expect(mod.readSentDateFromDisk('2026-09-05')).toBe(false);
    expect(await mod.isDailySummarySent('2026-09-05')).toBe(true);
  });

  it('preserves claim on partial send error to prevent duplicate spam', async () => {
    let markDbSentCalled = false;
    let releaseDbClaimCalled = false;
    vi.doMock('@/lib/single-company', () => ({
      getSingleCompany: async () => ({ id: 'c1', cnpj: 'x' }),
    }));
    vi.doMock('@/lib/prisma', () => ({
      default: {
        invoice: {
          findMany: async () => [
            { number: '1', totalValue: 100, cfop: '5102', cancelledAt: null, recipientCnpj: '1', recipientName: 'A' },
            { number: '2', totalValue: 200, cfop: '5102', cancelledAt: null, recipientCnpj: '2', recipientName: 'B' },
          ],
        },
        contactNickname: { findMany: async () => [] },
        dailyIssuedSummarySend: {
          findUnique: async () => null,
          create: async () => ({}),
          update: async () => { markDbSentCalled = true; return {}; },
          deleteMany: async () => { releaseDbClaimCalled = true; return { count: 0 }; },
        },
        $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
          fn({
            dailyIssuedSummarySend: {
              findUnique: async () => null,
              create: async () => ({}),
            },
          }),
      },
    }));
    vi.doMock('@/lib/postgres-advisory-lock', () => ({
      acquirePostgresAdvisoryLock: async () => ({ release: async () => undefined }),
      acquirePostgresTransactionAdvisoryLock: async () => undefined,
    }));
    let sendCalls = 0;
    vi.doMock('@/lib/whatsapp-evolution', () => ({
      getEvolutionConfig: () => ({
        baseUrl: 'https://evolution.qlmed.com.br',
        instance: 'qlmed',
        apiKey: 'k',
      }),
      sendWhatsAppText: vi.fn(async () => {
        sendCalls += 1;
        if (sendCalls > 1) throw new Error('Simulated network timeout on second message');
      }),
    }));
    const mod = await import('@/lib/daily-issued-summary-job');
    mod.__resetDailySummarySentMemory();
    const result = await mod.runDailyIssuedSummary({ now: new Date('2026-09-05T22:00:00.000Z') });
    expect(result.status).toBe('error');
    expect(result.sent).toBeGreaterThanOrEqual(1);
    // Deve preservar o claim no banco (markDbSent) e NÃO liberar (releaseDbClaim) para evitar spam
    expect(markDbSentCalled).toBe(true);
    expect(releaseDbClaimCalled).toBe(false);
  });
});
