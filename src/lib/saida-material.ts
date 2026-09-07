/**
 * SPEC-057 — helpers puros de Saída Material (CFOP, clamp, agrupamento).
 */

export type SaidaMaterialTab =
  | 'consignado'
  | 'saida_avulsa'
  | 'venda_direta'
  | 'material_usado';

export const SAIDA_MATERIAL_TABS: Array<{ id: SaidaMaterialTab; label: string }> = [
  { id: 'consignado', label: 'Consignado' },
  { id: 'saida_avulsa', label: 'Saída Avulsa' },
  { id: 'venda_direta', label: 'Venda Direta' },
  { id: 'material_usado', label: 'Registro Material Usado' },
];

/** CFOP default por aba; Saída Avulsa não emite NF por padrão. */
export function defaultCfopForTab(tab: SaidaMaterialTab): string | null {
  switch (tab) {
    case 'consignado':
      return '5917';
    case 'venda_direta':
      return '5102';
    case 'material_usado':
      return '5114';
    case 'saida_avulsa':
      return null;
    default:
      return null;
  }
}

export function tabRequiresCustomer(tab: SaidaMaterialTab): boolean {
  return tab === 'consignado' || tab === 'venda_direta' || tab === 'material_usado';
}

export function tabUsesCdStock(tab: SaidaMaterialTab): boolean {
  return tab !== 'material_usado';
}

/** Quantidade do carrinho limitada ao saldo disponível (nunca negativa). */
export function clampCartQty(requested: number, available: number): number {
  if (!Number.isFinite(requested) || requested <= 0) return 0;
  if (!Number.isFinite(available) || available <= 0) return 0;
  return Math.min(requested, available);
}

export interface BalanceLike {
  productCodigo: string;
  productName: string | null;
  productType?: string | null;
  productSubtype?: string | null;
  manufacturer?: string | null;
  description?: string | null;
  lot: string;
  lotExpiry: string | null;
  quantity: number;
  locationType?: string;
  locationCnpj?: string | null;
  locationName?: string | null;
  validityBand?: string;
  daysToExpiry?: number | null;
}

export interface ProductBalanceGroup {
  productCodigo: string;
  productName: string;
  productType: string;
  productSubtype: string;
  manufacturer: string | null;
  description: string | null;
  totalQty: number;
  lots: BalanceLike[];
}

export interface TypeSubtypeGroup {
  productType: string;
  productSubtype: string;
  products: ProductBalanceGroup[];
}

/** Agrupa saldos por tipo → subtipo → produto (lotes FEFO já vêm ordenados). */
export function groupBalancesByCatalog(balances: BalanceLike[]): TypeSubtypeGroup[] {
  const byProduct = new Map<string, ProductBalanceGroup>();
  for (const b of balances) {
    if (b.quantity <= 0) continue;
    let g = byProduct.get(b.productCodigo);
    if (!g) {
      g = {
        productCodigo: b.productCodigo,
        productName: b.productName || b.description || b.productCodigo,
        productType: b.productType?.trim() || 'Sem linha',
        productSubtype: b.productSubtype?.trim() || 'Sem grupo',
        manufacturer: b.manufacturer ?? null,
        description: b.description ?? b.productName ?? null,
        totalQty: 0,
        lots: [],
      };
      byProduct.set(b.productCodigo, g);
    }
    g.lots.push(b);
    g.totalQty += b.quantity;
  }

  const byType = new Map<string, TypeSubtypeGroup>();
  for (const p of byProduct.values()) {
    p.totalQty = Math.round(p.totalQty * 1000) / 1000;
    const key = `${p.productType}||${p.productSubtype}`;
    let t = byType.get(key);
    if (!t) {
      t = { productType: p.productType, productSubtype: p.productSubtype, products: [] };
      byType.set(key, t);
    }
    t.products.push(p);
  }

  const groups = Array.from(byType.values());
  groups.sort((a, b) => {
    const c = a.productType.localeCompare(b.productType, 'pt-BR');
    if (c !== 0) return c;
    return a.productSubtype.localeCompare(b.productSubtype, 'pt-BR');
  });
  for (const g of groups) {
    g.products.sort((a, b) => a.productName.localeCompare(b.productName, 'pt-BR'));
  }
  return groups;
}

export function lotKey(productCodigo: string, lot: string, lotExpiry: string | null): string {
  return `${productCodigo}|${lot}|${lotExpiry ?? ''}`;
}
