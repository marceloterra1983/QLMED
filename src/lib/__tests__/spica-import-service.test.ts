import { describe, expect, it } from 'vitest';
import { buildCanonicalSpicaProductKey } from '@/lib/spica/import-service';

describe('spica/import-service', () => {
  it('gera chave CODE:REF::UNIT:UN para referencias unicas e validas', () => {
    const key = buildCanonicalSpicaProductKey('BBXX01A-RK', '007550', true);
    expect(key).toBe('CODE:BBXX01A-RK::UNIT:UN');
  });

  it('gera chave SPICA:CODIGO quando referencia for duplicada', () => {
    const key = buildCanonicalSpicaProductKey('PROCAT', '004235', false);
    expect(key).toBe('SPICA:004235');
  });

  it('gera chave SPICA:CODIGO quando referencia for _ ou vazia', () => {
    const key1 = buildCanonicalSpicaProductKey('_', '005267', true);
    expect(key1).toBe('SPICA:005267');

    const key2 = buildCanonicalSpicaProductKey('', '001234', true);
    expect(key2).toBe('SPICA:001234');
  });
});
