import { describe, expect, it } from 'vitest';
import {
  classifyIssuedStockCfop,
  daysToExpiry,
  parseLotExpiry,
  validityBand,
} from '@/lib/stock-ledger';

describe('parseLotExpiry', () => {
  it('aceita YYYY-MM-DD', () => {
    const d = parseLotExpiry('2026-12-15');
    expect(d?.toISOString().slice(0, 10)).toBe('2026-12-15');
  });

  it('aceita YYYYMMDD', () => {
    const d = parseLotExpiry('20261215');
    expect(d?.toISOString().slice(0, 10)).toBe('2026-12-15');
  });

  it('aceita DD/MM/YYYY', () => {
    const d = parseLotExpiry('15/12/2026');
    expect(d?.toISOString().slice(0, 10)).toBe('2026-12-15');
  });

  it('retorna null para vazio/inválido', () => {
    expect(parseLotExpiry(null)).toBeNull();
    expect(parseLotExpiry('')).toBeNull();
    expect(parseLotExpiry('   ')).toBeNull();
  });
});

describe('validityBand / daysToExpiry', () => {
  const now = new Date(Date.UTC(2026, 8, 7)); // 2026-09-07

  it('vencido', () => {
    expect(validityBand('2026-09-01', now)).toBe('vencido');
    expect(daysToExpiry('2026-09-01', now)).toBe(-6);
  });

  it('d30', () => {
    expect(validityBand('2026-09-20', now)).toBe('d30');
    expect(daysToExpiry('2026-09-20', now)).toBe(13);
  });

  it('d90', () => {
    expect(validityBand('2026-11-01', now)).toBe('d90');
    expect(daysToExpiry('2026-11-01', now)).toBe(55);
  });

  it('ok', () => {
    expect(validityBand('2027-01-15', now)).toBe('ok');
    expect(daysToExpiry('2027-01-15', now)).toBe(130);
  });

  it('sem_validade', () => {
    expect(validityBand(null, now)).toBe('sem_validade');
    expect(validityBand('', now)).toBe('sem_validade');
    expect(daysToExpiry(null, now)).toBeNull();
  });
});

describe('classifyIssuedStockCfop', () => {
  it('5102 → SAIDA do CD', () => {
    expect(classifyIssuedStockCfop('5102')).toEqual({
      kind: 'SAIDA_NFE',
      from: 'CD',
      to: null,
    });
  });

  it('5917 → REMESSA CD→CUSTOMER', () => {
    expect(classifyIssuedStockCfop('5917')).toEqual({
      kind: 'REMESSA_CONSIG',
      from: 'CD',
      to: 'CUSTOMER',
    });
  });

  it('1918 → RETORNO CUSTOMER→CD', () => {
    expect(classifyIssuedStockCfop('1918')).toEqual({
      kind: 'RETORNO_CONSIG',
      from: 'CUSTOMER',
      to: 'CD',
    });
  });

  it('5114 → SAIDA a partir do CUSTOMER', () => {
    expect(classifyIssuedStockCfop('5114')).toEqual({
      kind: 'SAIDA_NFE',
      from: 'CUSTOMER',
      to: null,
    });
  });
});
