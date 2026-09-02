import { describe, expect, it } from 'vitest';
import { toProductRow, type ImportProduct } from '@/lib/valvulas-importadas-row';

/**
 * QLMED-UI-003 — o relatório de válvulas tinha um `REAL_STOCK` com a contagem
 * física de fev/2026 (`'005032': 17`, …) e o `netQty` preferia esse número ao
 * cálculo. O portão anterior lia o fonte com regex e ficava verde com o
 * defeito reposto sob outro nome ou com ternário em vez de `??`. Este chama a
 * função com dados: não há forma de um mapa cravado sobreviver a isto.
 */
function product(code: string, purchasedQty: number, soldQty: number): ImportProduct {
  return {
    key: code,
    code,
    description: 'Válvula',
    shortName: null,
    unit: 'UN',
    anvisa: null,
    purchasedQty,
    purchasedValue: purchasedQty * 10,
    soldQty,
    soldValue: soldQty * 15,
    resaleQty: 0,
    resaleValue: 0,
  };
}

describe('QLMED-UI-003 — netQty é comprado menos vendido, sem mapa cravado', () => {
  // Códigos que estavam no mapa antigo, com o valor que o mapa devolvia.
  const formerlyPinned: Array<[code: string, pinned: number]> = [
    ['005032', 17],
    ['005033', 20],
    ['005029', 21],
  ];

  it.each(formerlyPinned)('%s: saldo vem da conta, não da contagem de fev/2026 (%i)', (code, pinned) => {
    // Escolhe quantidades cujo saldo é diferente do número cravado.
    const purchased = pinned + 30;
    const sold = 3;
    const row = toProductRow(product(code, purchased, sold));
    expect(row.netQty).toBe(purchased - sold);
    expect(row.netQty).not.toBe(pinned);
  });

  it('saldo negativo é reportado como negativo, não zerado nem substituído', () => {
    expect(toProductRow(product('005034', 2, 5)).netQty).toBe(-3);
  });

  it('arredonda a duas casas', () => {
    expect(toProductRow(product('005160', 7.333, 1.111)).netQty).toBe(6.22);
  });

  it('preço médio é nulo sem quantidade', () => {
    const row = toProductRow(product('005031', 0, 0));
    expect(row.avgPurchasePrice).toBeNull();
    expect(row.avgSalePrice).toBeNull();
  });
});
