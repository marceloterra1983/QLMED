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
    delete process.env.DAILY_SUMMARY_DRY_RUN;
    process.env.NOTIFICATION_WHATSAPP_GROUP = '120363411914746947@g.us';
    process.env.EVO_API_URL = 'https://evolution.qlmed.com.br';
    process.env.EVO_INSTANCE = 'qlmed';
    process.env.EVO_API_KEY = 'k';
  });

  afterEach(() => {
    rmSync(stateDir, { recursive: true, force: true });
    delete process.env.DAILY_SUMMARY_STATE_DIR;
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
      },
    }));
    vi.doMock('@/lib/postgres-advisory-lock', () => ({
      acquirePostgresAdvisoryLock: async () => ({ release: async () => undefined }),
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
});
