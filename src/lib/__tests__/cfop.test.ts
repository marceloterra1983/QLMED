import { describe, it, expect } from 'vitest';
import {
  getCfopTagByCode,
  getCfopCodesByTag,
  getCfopTagOptions,
  extractFirstCfop,
  isImportEntryCfop,
} from '../cfop';

describe('getCfopTagByCode', () => {
  it('returns correct tag for known CFOP codes', () => {
    expect(getCfopTagByCode('5102')).toBe('Venda');
    expect(getCfopTagByCode('1102')).toBe('Compra');
    expect(getCfopTagByCode('5910')).toBe('Bonificação');
    expect(getCfopTagByCode('6202')).toBe('Dev. Compra');
    expect(getCfopTagByCode('3102')).toBe('Compra Importação');
  });

  it('returns null for unknown CFOP codes', () => {
    expect(getCfopTagByCode('9999')).toBeNull();
    expect(getCfopTagByCode('0000')).toBeNull();
  });

  it('returns null for null/undefined/empty input', () => {
    expect(getCfopTagByCode(null)).toBeNull();
    expect(getCfopTagByCode(undefined)).toBeNull();
    expect(getCfopTagByCode('')).toBeNull();
  });
});

describe('getCfopCodesByTag', () => {
  it('returns all codes for Venda tag', () => {
    const codes = getCfopCodesByTag('Venda');
    expect(codes).toContain('5102');
    expect(codes).toContain('5405');
    expect(codes).toContain('6101');
    expect(codes).toContain('6102');
    expect(codes.length).toBe(6);
  });

  it('returns all codes for Compra tag', () => {
    const codes = getCfopCodesByTag('Compra');
    expect(codes).toEqual(['1102', '1403', '2102', '2403']);
  });

  it('returns empty array for unknown tag', () => {
    expect(getCfopCodesByTag('NonExistent')).toEqual([]);
  });
});

describe('getCfopTagOptions', () => {
  it('returns unique tag values', () => {
    const options = getCfopTagOptions();
    expect(options.length).toBe(new Set(options).size);
    expect(options).toContain('Venda');
    expect(options).toContain('Compra');
    expect(options).toContain('Bonificação');
  });
});

describe('isImportEntryCfop', () => {
  it('returns true for codes starting with 3', () => {
    expect(isImportEntryCfop('3102')).toBe(true);
    expect(isImportEntryCfop('3000')).toBe(true);
  });

  it('returns false for other codes', () => {
    expect(isImportEntryCfop('5102')).toBe(false);
    expect(isImportEntryCfop('1102')).toBe(false);
  });

  it('returns false for null/undefined', () => {
    expect(isImportEntryCfop(null)).toBe(false);
    expect(isImportEntryCfop(undefined)).toBe(false);
  });
});

describe('extractFirstCfop', () => {
  it('extracts CFOP from XML content', () => {
    expect(extractFirstCfop('<CFOP>5102</CFOP>')).toBe('5102');
    expect(extractFirstCfop('<det><prod><CFOP>1102</CFOP></prod></det>')).toBe('1102');
  });

  it('extracts CFOP with whitespace', () => {
    expect(extractFirstCfop('<CFOP> 5102 </CFOP>')).toBe('5102');
  });

  it('is case-insensitive on tag name', () => {
    expect(extractFirstCfop('<cfop>6101</cfop>')).toBe('6101');
  });

  it('returns null when no CFOP found', () => {
    expect(extractFirstCfop('<other>5102</other>')).toBeNull();
    expect(extractFirstCfop('')).toBeNull();
  });

  it('returns null for null/undefined input', () => {
    expect(extractFirstCfop(null)).toBeNull();
    expect(extractFirstCfop(undefined)).toBeNull();
  });

  it('returns only first match when multiple CFOPs exist', () => {
    expect(extractFirstCfop('<CFOP>5102</CFOP><CFOP>6101</CFOP>')).toBe('5102');
  });
});
