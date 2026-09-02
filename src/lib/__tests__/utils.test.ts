import { describe, it, expect } from 'vitest';
import {
  cleanString,
  ensureArray,
  toNumber,
  normalizeForSearch,
  flexMatchAll,
  formatCnpj,
  formatAccessKey,
  formatCurrencyShort,
  FILTER_INPUT_CLS,
} from '../utils';

describe('cleanString', () => {
  it('trims and returns non-empty strings', () => {
    expect(cleanString('  hello  ')).toBe('hello');
    expect(cleanString('test')).toBe('test');
  });

  it('returns null for empty / whitespace-only strings', () => {
    expect(cleanString('')).toBeNull();
    expect(cleanString('   ')).toBeNull();
  });

  it('returns null for null / undefined', () => {
    expect(cleanString(null)).toBeNull();
    expect(cleanString(undefined)).toBeNull();
  });

  it('converts non-string values to string', () => {
    expect(cleanString(123)).toBe('123');
    expect(cleanString(0)).toBe('0');
    expect(cleanString(false)).toBe('false');
  });
});

describe('ensureArray', () => {
  it('wraps a single value in an array', () => {
    expect(ensureArray('a')).toEqual(['a']);
    expect(ensureArray(1)).toEqual([1]);
  });

  it('returns existing arrays as-is', () => {
    expect(ensureArray([1, 2])).toEqual([1, 2]);
    expect(ensureArray([])).toEqual([]);
  });

  it('returns empty array for null / undefined', () => {
    expect(ensureArray(null)).toEqual([]);
    expect(ensureArray(undefined)).toEqual([]);
  });
});

describe('toNumber', () => {
  it('parses normal numbers', () => {
    expect(toNumber('123')).toBe(123);
    expect(toNumber('12.5')).toBe(12.5);
    expect(toNumber(42)).toBe(42);
  });

  it('handles Brazilian comma decimal separator', () => {
    expect(toNumber('12,5')).toBe(12.5);
    expect(toNumber('1234,99')).toBe(1234.99);
  });

  it('returns 0 for null / undefined / NaN', () => {
    expect(toNumber(null)).toBe(0);
    expect(toNumber(undefined)).toBe(0);
    expect(toNumber('abc')).toBe(0);
    expect(toNumber('')).toBe(0);
  });

  it('returns 0 for Infinity', () => {
    expect(toNumber('Infinity')).toBe(0);
    expect(toNumber('-Infinity')).toBe(0);
  });
});

describe('normalizeForSearch', () => {
  it('removes accents and lowercases', () => {
    expect(normalizeForSearch('São Paulo')).toBe('sao paulo');
    expect(normalizeForSearch('Café')).toBe('cafe');
    expect(normalizeForSearch('AÇÃO')).toBe('acao');
  });
});

describe('flexMatchAll', () => {
  it('matches when all words are found across fields', () => {
    expect(flexMatchAll(['São Paulo', 'Brasil'], ['sao', 'brasil'])).toBe(true);
  });

  it('fails when a word is not found in any field', () => {
    expect(flexMatchAll(['São Paulo'], ['sao', 'rio'])).toBe(false);
  });
});

describe('formatCnpj', () => {
  it('formats 14-digit CNPJ', () => {
    expect(formatCnpj('12345678000199')).toBe('12.345.678/0001-99');
  });

  it('returns input unchanged for wrong length', () => {
    expect(formatCnpj('123')).toBe('123');
    expect(formatCnpj('')).toBe('');
  });
});

describe('formatAccessKey', () => {
  it('inserts spaces every 4 characters', () => {
    expect(formatAccessKey('1234567890123456')).toBe('1234 5678 9012 3456');
  });
});

describe('formatCurrencyShort', () => {
  it('formats millions', () => {
    expect(formatCurrencyShort(2500000)).toBe('R$ 2.5M');
  });

  it('formats thousands', () => {
    expect(formatCurrencyShort(45000)).toBe('R$ 45k');
  });
});

describe('FILTER_INPUT_CLS', () => {
  it('keeps the fiscal filter contract', () => {
    expect(FILTER_INPUT_CLS).toContain('py-2.5');
    expect(FILTER_INPUT_CLS).toContain('rounded-lg');
    // O anel de foco é o do globals.css; um segundo aqui dava anel duplo (achado 07).
    expect(FILTER_INPUT_CLS).not.toMatch(/focus:(ring|border|outline)/);
    expect(FILTER_INPUT_CLS).toContain('placeholder-slate-500');
    expect(FILTER_INPUT_CLS).toContain('placeholder-slate-400');
  });
});
