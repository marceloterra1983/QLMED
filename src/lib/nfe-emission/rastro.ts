import { Decimal } from '@prisma/client-runtime-utils';
import { getCfopTagByCode } from '@/lib/cfop';

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\r/g, '&#xD;');
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function isRemessaConsignacaoCfop(cfop: string): boolean {
  const code = cfop.trim();
  return code === '5917' || code === '6917' || getCfopTagByCode(code) === 'Consignação';
}

export function assertConsignacaoLots(
  cfop: string,
  items: Array<{ lot?: string | null }>,
): void {
  if (!isRemessaConsignacaoCfop(cfop)) return;
  if (items.some((item) => !String(item.lot || '').trim())) {
    throw new Error('Consignação exige lote de estoque em cada item');
  }
}

/** YYMMDD no início do lote (ex.: 2402120084 → 2024-02-12). */
export function inferLotFab(lot: string, expiry: string | null | undefined): string | null {
  const m = lot.trim().match(/^(\d{2})(\d{2})(\d{2})/);
  if (m) {
    const yy = Number(m[1]);
    const month = Number(m[2]);
    const day = Number(m[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const year = yy >= 70 ? 1900 + yy : 2000 + yy;
      const iso = `${year}-${pad2(month)}-${pad2(day)}`;
      if (!expiry || iso <= expiry) return iso;
    }
  }
  if (expiry && /^\d{4}-\d{2}-\d{2}$/.test(expiry)) {
    const d = new Date(`${expiry}T00:00:00Z`);
    d.setUTCFullYear(d.getUTCFullYear() - 3);
    return d.toISOString().slice(0, 10);
  }
  return null;
}

export function buildRastroXml(input: {
  lot?: string | null;
  lotExpiry?: string | null;
  lotFab?: string | null;
  qCom: string;
}): string {
  const lot = String(input.lot || '').trim();
  if (!lot) return '';
  const dVal = String(input.lotExpiry || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dVal)) return '';
  const dFab = String(input.lotFab || '').trim() || inferLotFab(lot, dVal) || '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dFab)) return '';
  const qLote = new Decimal(input.qCom || 0).toDecimalPlaces(3, Decimal.ROUND_HALF_UP).toFixed(3);
  return `<rastro><nLote>${esc(lot)}</nLote><qLote>${qLote}</qLote><dFab>${dFab}</dFab><dVal>${dVal}</dVal></rastro>`;
}

export function preferredLotsFromItems(
  items: Array<{ cProd: string; qCom: string; lot?: string | null; lotExpiry?: string | null }>,
): Array<{ cProd: string; lot: string; lotExpiry: string | null; quantity: number }> {
  return items
    .filter((item) => String(item.lot || '').trim())
    .map((item) => ({
      cProd: item.cProd,
      lot: String(item.lot).trim(),
      lotExpiry: item.lotExpiry?.trim() || null,
      quantity: Number(item.qCom) || 0,
    }));
}
