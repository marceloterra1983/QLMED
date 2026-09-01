/**
 * Auditoria b177b07, QLMED-DATA-012 — mecanismo de retenção.
 *
 * O que estes testes travam é o comportamento seguro: sem prazo configurado, o
 * purge não apaga nada. O número de dias é decisão do dono/DPO e não pode ser
 * chutado por um default no código.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  accessLogDeleteMany: vi.fn(),
  notificationClickDeleteMany: vi.fn(),
  syncLogDeleteMany: vi.fn(),
  cnpjCacheDeleteMany: vi.fn(),
  ncmCacheDeleteMany: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  default: {
    accessLog: { deleteMany: mocks.accessLogDeleteMany },
    notificationClick: { deleteMany: mocks.notificationClickDeleteMany },
    syncLog: { deleteMany: mocks.syncLogDeleteMany },
    cnpjCache: { deleteMany: mocks.cnpjCacheDeleteMany },
    ncmCache: { deleteMany: mocks.ncmCacheDeleteMany },
  },
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import {
  RETENTION_RULES,
  parseRetentionDays,
  purgeExpiredOperationalData,
} from '@/lib/data-retention';

const NOW = new Date('2026-09-01T12:00:00.000Z');

const allDeleteMocks = [
  mocks.accessLogDeleteMany,
  mocks.notificationClickDeleteMany,
  mocks.syncLogDeleteMany,
  mocks.cnpjCacheDeleteMany,
  mocks.ncmCacheDeleteMany,
];

describe('QLMED-DATA-012 — o prazo é decisão humana, não default de código', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const m of allDeleteMocks) m.mockResolvedValue({ count: 0 });
  });

  it('sem variável de ambiente, nenhuma tabela é tocada', async () => {
    const outcomes = await purgeExpiredOperationalData(NOW, {});

    for (const m of allDeleteMocks) expect(m).not.toHaveBeenCalled();
    expect(outcomes).toHaveLength(RETENTION_RULES.length);
    for (const outcome of outcomes) {
      expect(outcome.days).toBeNull();
      expect(outcome.deleted).toBe(0);
      expect(outcome.skippedReason).toBe('no-retention-configured');
    }
  });

  it('prazo inválido é recusado como inválido, não tratado como zero', () => {
    // `0` apagaria tudo e um negativo é engano de configuração. Falha segura é
    // não apagar, e dizer que a configuração está errada.
    expect(parseRetentionDays('0')).toBeNull();
    expect(parseRetentionDays('-1')).toBeNull();
    expect(parseRetentionDays('abc')).toBeNull();
    expect(parseRetentionDays('30.5')).toBeNull();
    expect(parseRetentionDays(undefined)).toBeNull();
    expect(parseRetentionDays('   ')).toBeNull();
    expect(parseRetentionDays('30')).toBe(30);
    expect(parseRetentionDays(' 365 ')).toBe(365);
  });

  it('prazo inválido não apaga, e o retorno distingue de "não configurado"', async () => {
    const outcomes = await purgeExpiredOperationalData(NOW, {
      QLMED_RETENTION_ACCESS_LOG_DAYS: '0',
    });

    expect(mocks.accessLogDeleteMany).not.toHaveBeenCalled();
    expect(outcomes.find((o) => o.table === 'AccessLog')?.skippedReason).toBe('invalid-retention');
  });
});

describe('QLMED-DATA-012 — com prazo configurado, o corte é o esperado', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const m of allDeleteMocks) m.mockResolvedValue({ count: 0 });
  });

  it('apaga só a tabela configurada, e pela coluna de tempo daquela tabela', async () => {
    mocks.accessLogDeleteMany.mockResolvedValue({ count: 42 });

    const outcomes = await purgeExpiredOperationalData(NOW, {
      QLMED_RETENTION_ACCESS_LOG_DAYS: '30',
    });

    expect(mocks.accessLogDeleteMany).toHaveBeenCalledWith({
      where: { createdAt: { lt: new Date('2026-08-02T12:00:00.000Z') } },
    });
    // As outras continuam sem prazo — configurar uma não liga as demais.
    expect(mocks.syncLogDeleteMany).not.toHaveBeenCalled();
    expect(mocks.cnpjCacheDeleteMany).not.toHaveBeenCalled();
    expect(outcomes.find((o) => o.table === 'AccessLog')).toEqual({
      table: 'AccessLog',
      days: 30,
      deleted: 42,
    });
  });

  it('SyncLog é cortado por startedAt, não por createdAt que não existe lá', async () => {
    await purgeExpiredOperationalData(NOW, { QLMED_RETENTION_SYNC_LOG_DAYS: '90' });

    expect(mocks.syncLogDeleteMany).toHaveBeenCalledWith({
      where: { startedAt: { lt: new Date('2026-06-03T12:00:00.000Z') } },
    });
  });

  it('toda regra aponta para um delegate Prisma que existe', async () => {
    const env = Object.fromEntries(RETENTION_RULES.map((r) => [r.envVar, '10']));

    const outcomes = await purgeExpiredOperationalData(NOW, env);

    // Se uma regra apontasse para tabela inexistente, delegateFor lançaria.
    expect(outcomes.every((o) => o.days === 10)).toBe(true);
    for (const m of allDeleteMocks) expect(m).toHaveBeenCalledTimes(1);
  });
});
