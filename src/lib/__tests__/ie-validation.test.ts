import { describe, it, expect } from 'vitest';
import { validateIE } from '../ie-validation';

describe('validateIE', () => {
  it('returns valid when IE or UF is missing', () => {
    expect(validateIE(null, 'SP')).toEqual({ valid: true });
    expect(validateIE('123456789012', null)).toEqual({ valid: true });
    expect(validateIE(undefined, undefined)).toEqual({ valid: true });
    expect(validateIE('', 'SP')).toEqual({ valid: true });
  });

  it('accepts ISENTO / ISENTA for any state', () => {
    expect(validateIE('ISENTO', 'SP').valid).toBe(true);
    expect(validateIE('ISENTA', 'MG').valid).toBe(true);
    expect(validateIE('isento', 'RJ').valid).toBe(true);
  });

  describe('SP - 12 digits or P + 12 digits', () => {
    it('accepts valid 12-digit IE', () => {
      expect(validateIE('123456789012', 'SP').valid).toBe(true);
    });

    it('accepts producer rural format P + 12 digits', () => {
      expect(validateIE('P123456789012', 'SP').valid).toBe(true);
    });

    it('rejects wrong length', () => {
      const result = validateIE('12345678901', 'SP');
      expect(result.valid).toBe(false);
      expect(result.message).toContain('SP');
    });
  });

  describe('MG - 13 digits', () => {
    it('accepts valid 13-digit IE', () => {
      expect(validateIE('1234567890123', 'MG').valid).toBe(true);
    });

    it('rejects wrong length', () => {
      expect(validateIE('123456789012', 'MG').valid).toBe(false);
    });
  });

  describe('RJ - 8 digits', () => {
    it('accepts valid 8-digit IE', () => {
      expect(validateIE('12345678', 'RJ').valid).toBe(true);
    });

    it('rejects wrong length', () => {
      expect(validateIE('123456789', 'RJ').valid).toBe(false);
    });
  });

  describe('PR - 10 digits', () => {
    it('accepts valid 10-digit IE', () => {
      expect(validateIE('1234567890', 'PR').valid).toBe(true);
    });
  });

  describe('GO - 9 digits starting with specific prefixes', () => {
    it('accepts valid prefixes', () => {
      expect(validateIE('101234567', 'GO').valid).toBe(true);
      expect(validateIE('111234567', 'GO').valid).toBe(true);
      expect(validateIE('151234567', 'GO').valid).toBe(true);
      expect(validateIE('201234567', 'GO').valid).toBe(true);
      expect(validateIE('291234567', 'GO').valid).toBe(true);
    });

    it('rejects invalid prefix', () => {
      expect(validateIE('121234567', 'GO').valid).toBe(false);
    });
  });

  describe('BA - 8 or 9 digits', () => {
    it('accepts 8 digits', () => {
      expect(validateIE('12345678', 'BA').valid).toBe(true);
    });

    it('accepts 9 digits', () => {
      expect(validateIE('123456789', 'BA').valid).toBe(true);
    });

    it('rejects 7 digits', () => {
      expect(validateIE('1234567', 'BA').valid).toBe(false);
    });
  });

  it('strips formatting characters before validation', () => {
    // SP with dots and dashes
    expect(validateIE('123.456.789.012', 'SP').valid).toBe(true);
  });

  it('handles case-insensitive UF', () => {
    expect(validateIE('123456789012', 'sp').valid).toBe(true);
  });

  it('returns valid with message for unknown UF', () => {
    const result = validateIE('12345', 'XX');
    expect(result.valid).toBe(true);
    expect(result.message).toContain('desconhecida');
  });
});
