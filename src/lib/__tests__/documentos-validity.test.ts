import { describe, expect, it } from 'vitest';
import { familyByCategory, kindExpires } from '@/lib/documentos/constants';
import {
  daysRemaining,
  selectVigente,
  statusFor,
  thresholdDue,
  todayInSaoPaulo,
} from '@/lib/documentos/validity';

describe('SPEC-042 L3 — daysRemaining / todayInSaoPaulo', () => {
  it('diferença civil: 25, 0 e -22', () => {
    expect(daysRemaining('2026-09-04', '2026-09-29')).toBe(25);
    expect(daysRemaining('2026-09-04', '2026-09-04')).toBe(0);
    expect(daysRemaining('2026-09-04', '2026-08-13')).toBe(-22);
  });

  it('2026-09-05T02:30:00Z é 2026-09-04 em America/Sao_Paulo', () => {
    expect(todayInSaoPaulo(new Date('2026-09-05T02:30:00Z'))).toBe('2026-09-04');
  });
});

describe('SPEC-042 L3 — statusFor', () => {
  it('cobre as 6 chaves', () => {
    expect(statusFor(31)).toEqual({ key: 'ok', label: 'ok' });
    expect(statusFor(30)).toEqual({ key: 'atencao', label: 'atenção' });
    expect(statusFor(8)).toEqual({ key: 'atencao', label: 'atenção' });
    expect(statusFor(7)).toEqual({ key: 'urgente', label: 'urgente' });
    expect(statusFor(1)).toEqual({ key: 'urgente', label: 'urgente' });
    expect(statusFor(0)).toEqual({ key: 'hoje', label: 'vence hoje' });
    expect(statusFor(-22)).toEqual({ key: 'vencida', label: 'vencida há 22 dias' });
    expect(statusFor(null)).toEqual({ key: 'sem_data', label: 'sem data' });
  });
});

describe('SPEC-042 L3 — selectVigente', () => {
  it('maior validUntil não removido; null só ganha se for a única do kind', () => {
    const rows = [
      { id: 'old', kind: 'cnd_federal' as const, validUntil: '2026-05-13', removedAt: null },
      { id: 'vigente', kind: 'cnd_federal' as const, validUntil: '2026-12-12', removedAt: null },
      { id: 'removed', kind: 'cnd_federal' as const, validUntil: '2026-12-31', removedAt: '2026-01-01' },
      { id: 'fgts-null', kind: 'crf_fgts' as const, validUntil: null, removedAt: null },
      { id: 'fgts-dated', kind: 'crf_fgts' as const, validUntil: new Date('2026-09-29T00:00:00.000Z'), removedAt: null },
      { id: 'cndt-only', kind: 'cndt' as const, validUntil: null, removedAt: null },
    ];
    const map = selectVigente(rows);
    expect(map.get('cnd_federal')?.id).toBe('vigente');
    expect(map.get('crf_fgts')?.id).toBe('fgts-dated');
    expect(map.get('cndt')?.id).toBe('cndt-only');
    expect(map.size).toBe(3);
  });
});

describe('SPEC-042 L3 — thresholdDue', () => {
  it('30 uma vez; 25 com 30 já avisado é null; 31 não tem limiar', () => {
    expect(thresholdDue(30, [])).toBe(30);
    expect(thresholdDue(25, [30])).toBeNull();
    expect(thresholdDue(31, [])).toBeNull();
    expect(thresholdDue(15, [30])).toBe(15);
    expect(thresholdDue(25, [])).toBe(30);
  });

  it('vencida usa -7 e -14 e não repete', () => {
    expect(thresholdDue(-3, [])).toBe(-7);
    expect(thresholdDue(-8, [])).toBe(-14);
    expect(thresholdDue(-7, [-7])).toBeNull();
  });

  it('sanitária usa limiares 90 e 60 (não os da certidão)', () => {
    const sanitaria = familyByCategory('sanitaria').thresholds;
    expect([...sanitaria]).toEqual([90, 60, 30, 15, 7, 0]);
    expect(thresholdDue(90, [], sanitaria)).toBe(90);
    expect(thresholdDue(60, [90], sanitaria)).toBe(60);
    expect(thresholdDue(90, [], [30, 15, 7, 3, 1, 0])).toBeNull();
    expect(kindExpires('afe_anvisa')).toBe(false);
    expect(kindExpires('licenca_sanitaria')).toBe(true);
  });

  it('carta usa 60/30/15/7 e não alerta sem data', () => {
    const carta = familyByCategory('carta').thresholds;
    expect([...carta]).toEqual([60, 30, 15, 7]);
    expect(thresholdDue(30, [], carta)).toBe(30);
    expect(thresholdDue(90, [], carta)).toBeNull();
  });
});
