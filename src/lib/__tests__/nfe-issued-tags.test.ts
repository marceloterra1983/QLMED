import { describe, expect, it } from 'vitest';
import { issuedTagClasses, isVendaTag } from '@/lib/nfe-issued-tags';

describe('issuedTagClasses', () => {
  it('Venda/Compra/destaque/neutro', () => {
    expect(isVendaTag('Venda')).toBe(true);
    expect(isVendaTag('Compra')).toBe(false);
    expect(issuedTagClasses('Venda')).toContain('emerald');
    expect(issuedTagClasses('Compra')).toContain('rose');
    expect(issuedTagClasses(null, true)).toContain('amber');
    expect(issuedTagClasses(null, false)).toContain('slate');
  });
});
