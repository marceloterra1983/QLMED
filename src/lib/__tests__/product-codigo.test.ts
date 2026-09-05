import { describe, expect, it } from 'vitest';
import { formatCodigo, normalizeCodigoDigits, padSpicaCodigo } from '@/lib/product-codigo-format';
import { nextCodigo } from '@/lib/product-codigo';

describe('product-codigo-format', () => {
  it('formatCodigo usa pad 6', () => {
    expect(formatCodigo(1)).toBe('000001');
    expect(formatCodigo(7972)).toBe('007972');
  });

  it('formatCodigo nao trunca numeros com mais de 6 digitos', () => {
    expect(formatCodigo(1234567)).toBe('1234567');
  });

  it('padSpicaCodigo normaliza strings Spica', () => {
    expect(padSpicaCodigo('005999')).toBe('005999');
    expect(padSpicaCodigo('5999')).toBe('005999');
    expect(padSpicaCodigo('')).toBeNull();
  });

  it('normalizeCodigoDigits remove nao-digitos', () => {
    expect(normalizeCodigoDigits('00.5999')).toBe('005999');
    expect(normalizeCodigoDigits(null)).toBeNull();
  });
});

describe('nextCodigo', () => {
  it('retorna max+1 com pad 6 apos codigo Spica 007971', async () => {
    const db = {
      productRegistry: {
        findMany: async () => [{ codigo: '007971' }, { codigo: '00088' }],
      },
    };
    await expect(nextCodigo(db as never, 'co1')).resolves.toBe('007972');
  });

  it('comeca em 000001 se vazio', async () => {
    const db = {
      productRegistry: {
        findMany: async () => [],
      },
    };
    await expect(nextCodigo(db as never, 'co1')).resolves.toBe('000001');
  });
});
