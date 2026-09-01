/**
 * Linha do relatório de válvulas importadas.
 *
 * Auditoria b177b07 (QLMED-UI-003): existia um mapa `REAL_STOCK` com a
 * contagem física de fev/2026 e o `netQty` preferia esse número ao cálculo.
 * A tela chama a coluna de "Saldo" — o leitor entende comprado menos vendido.
 * A conta vive aqui, fora do `route.ts`, para o portão poder chamá-la com
 * dados em vez de ler o fonte com regex (re-auditoria, gate do UI-003).
 */
export interface ImportProduct {
  key: string;        // internal cProd code (from issued import invoice)
  code: string;
  description: string;
  shortName: string | null;
  unit: string;
  anvisa: string | null;
  purchasedQty: number;
  purchasedValue: number;
  soldQty: number;
  soldValue: number;
  resaleQty: number;
  resaleValue: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function toProductRow(p: ImportProduct) {
  return {
    key: p.key,
    code: p.code,
    description: p.description,
    shortName: p.shortName,
    unit: p.unit,
    anvisa: p.anvisa,
    purchasedQty: round2(p.purchasedQty),
    purchasedValue: round2(p.purchasedValue),
    soldQty: round2(p.soldQty),
    soldValue: round2(p.soldValue),
    resaleQty: round2(p.resaleQty),
    resaleValue: round2(p.resaleValue),
    netQty: round2(p.purchasedQty - p.soldQty),
    avgPurchasePrice: p.purchasedQty > 0 ? round2(p.purchasedValue / p.purchasedQty) : null,
    avgSalePrice: p.soldQty > 0 ? round2(p.soldValue / p.soldQty) : null,
  };
}
