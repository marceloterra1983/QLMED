import { describe, expect, it } from 'vitest';
import { buildNfeAccessKey, nextInvoiceNumber, nfeAccessKeyCheckDigit } from '@/lib/nfe-emission/access-key';

describe('nfe access key', () => {
  it('calcula DV módulo 11 da chave de 44 dígitos', () => {
    const first43 = '5026081234567800019955001000000001112345678';
    const dv = nfeAccessKeyCheckDigit(first43);
    const key = first43 + dv;
    expect(key).toHaveLength(44);
    expect(nfeAccessKeyCheckDigit(key.slice(0, 43))).toBe(dv);
  });

  it('monta chave com UF, AAMM, CNPJ, modelo 55 e série', () => {
    const key = buildNfeAccessKey({
      cUf: '50',
      issueDate: new Date(2026, 7, 30),
      cnpj: '12.345.678/0001-99',
      series: '1',
      number: '17',
      cNf: '12345678',
    });
    expect(key).toHaveLength(44);
    expect(key.slice(0, 2)).toBe('50');
    expect(key.slice(2, 6)).toBe('2608');
    expect(key.slice(6, 20)).toBe('12345678000199');
    expect(key.slice(20, 22)).toBe('55');
    expect(key.slice(22, 25)).toBe('001');
    expect(key.slice(25, 34)).toBe('000000017');
  });

  it('próximo número é o maior existente + 1', () => {
    expect(nextInvoiceNumber([])).toBe(1);
    expect(nextInvoiceNumber(['12', 3, '00015'])).toBe(16);
  });
});
