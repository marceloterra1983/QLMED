import { describe, expect, it } from 'vitest';
import { shouldPreserveEditedItems } from '@/lib/gestao-oficio-edits';
import { parseImpcgItemDraft, parseMoneyInputToCents } from '@/lib/impcg/parse-oficio';

describe('IMPCG items edit (AC-017)', () => {
  it('aceita dinheiro da API e BRL em centavos', () => {
    expect(parseMoneyInputToCents('12550.00')).toBe(1_255_000);
    expect(parseMoneyInputToCents('12.550,00')).toBe(1_255_000);
    expect(parseMoneyInputToCents('10')).toBe(1000);
    expect(parseMoneyInputToCents('abc')).toBeNull();
  });

  it('monta item editado sem inventar valor', () => {
    const item = parseImpcgItemDraft({
      description: 'KIT CEC',
      brand: 'EUROSETS',
      reference: 'AG5214',
      quantity: '1',
      unitAmount: '5500.00',
      lineTotal: '5.500,00',
    });
    expect(item).toMatchObject({
      description: 'KIT CEC',
      brand: 'EUROSETS',
      quantity: '1',
      unitCents: 550_000,
      lineCents: 550_000,
    });
    expect(parseImpcgItemDraft({
      description: '   ',
      quantity: '1',
      unitAmount: '10.00',
      lineTotal: '10.00',
    })).toBeNull();
  });

  it('não sobrescreve tabela quando editedFields contém items', () => {
    expect(shouldPreserveEditedItems(['items'])).toBe(true);
    expect(shouldPreserveEditedItems(['doctorName'])).toBe(false);
    expect(shouldPreserveEditedItems(undefined)).toBe(false);
  });
});
