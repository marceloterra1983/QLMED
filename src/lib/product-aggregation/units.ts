import { normalizeForSearch } from '@/lib/utils';
import { normalizeToken } from './shared';

export interface ProductBatch {
  lot: string;
  serial: string | null;
  quantity: number | null;
  fabrication: string | null;
  expiry: string | null;
}

export interface ProductFromXml {
  code: string;
  description: string;
  ncm: string | null;
  unit: string;
  anvisa: string | null;
  ean: string | null;
  quantity: number;
  unitPrice: number;
  totalValue: number;
  batches: ProductBatch[];
}

/* ── Unit normalization ── */
export const UNIT_ALIASES: Record<string, string> = {
  UNID: 'UN', UND: 'UN', UNIDADE: 'UN', UNIDADES: 'UN',
  PC: 'UN', 'PÇ': 'UN', PECA: 'UN', 'PEÇA': 'UN', PCS: 'UN', PECAS: 'UN', 'PEÇAS': 'UN',
  CAIXA: 'CX', CAIXAS: 'CX',
  KT: 'KIT', KITS: 'KIT',
  PR: 'PAR', PARES: 'PAR',
  LT: 'L', LITRO: 'L', LITROS: 'L',
  ML: 'ML', MILILITRO: 'ML', MILILITROS: 'ML',
  KG: 'KG', QUILO: 'KG', QUILOS: 'KG', QUILOGRAMA: 'KG',
  GR: 'G', GRAMA: 'G', GRAMAS: 'G',
  MT: 'M', METRO: 'M', METROS: 'M',
  RL: 'ROLO', ROLOS: 'ROLO',
  CT: 'CJ', CONJUNTO: 'CJ', CONJUNTOS: 'CJ',
  TB: 'TUBO', TUBOS: 'TUBO',
  FL: 'FR', FRASCO: 'FR', FRASCOS: 'FR',
  AMP: 'AMPOLA', AMPOLAS: 'AMPOLA',
};

export function normalizeUnit(raw: string | null | undefined): string {
  const upper = (raw || '').trim().toUpperCase().replace(/\./g, '');
  return UNIT_ALIASES[upper] || upper || '-';
}

export function buildProductKey(product: ProductFromXml): string {
  const codeToken = normalizeToken(product.code);
  const unitToken = normalizeUnit(product.unit);
  if (codeToken && codeToken !== '-') {
    return `CODE:${codeToken}::UNIT:${unitToken}`;
  }

  const eanToken = normalizeToken(product.ean).replace(/\D/g, '');
  if (eanToken && eanToken !== '0') {
    return `EAN:${eanToken}`;
  }

  const anvisaToken = normalizeToken(product.anvisa);
  if (anvisaToken) {
    return `ANVISA:${anvisaToken}`;
  }

  const descriptionToken = normalizeForSearch(product.description || 'item-sem-descricao');
  return `DESC:${descriptionToken}::UNIT:${unitToken}`;
}
