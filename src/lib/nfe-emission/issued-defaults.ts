/** Defaults copiados das NF-e já autorizadas (série 2, CRT 3, 30d/2026-08). */

export const DEFAULT_SERIES = '2';
export const DEFAULT_MOD_FRETE = '0';
export const DEFAULT_IND_PRES = '9';
export const DEFAULT_TPAG_VENDA = '15';
export const DEFAULT_INDPAG_VENDA = '1';
export const DEFAULT_PIS_CST = '01';
export const DEFAULT_PIS_ALIQUOTA = '0.6500';
export const DEFAULT_COFINS_ALIQUOTA = '3.0000';
export const DEFAULT_ICMS_CST_ISENTO = '40';

export const INF_AD_FISCO_SINIEF =
  'Procedimento autorizado pelo Ajuste SINIEF 02/24';

export const INF_CPL_ICMS_CONV_199 =
  'Isento ICMS Conv.1/99 Prorrog.ate 31/12/2026 pelo Conv 78/2025 de 08 de julho de 2025';

const SEM_PAGAMENTO_CFOPS = new Set([
  '1202', '1918', '2202', '2918',
  '5554', '5908', '5909', '5910', '5911', '5912', '5917', '5949',
  '6554', '6908', '6912', '6913', '6915', '6917', '6918', '6949',
]);

const DEVOLUCAO_CFOPS = new Set(['1202', '1918', '2202', '2918', '6202', '6918', '7202']);

const VENDA_CFOPS = new Set(['5102', '5405', '5551', '6101', '6102', '6108']);

const PIS_NT = new Set(['04', '05', '06', '07', '08', '09']);

export function isSemPagamentoCfop(cfop: string): boolean {
  return SEM_PAGAMENTO_CFOPS.has(cfop);
}

export function isDevolucaoCfop(cfop: string): boolean {
  return DEVOLUCAO_CFOPS.has(cfop);
}

export function isVendaCfop(cfop: string): boolean {
  return VENDA_CFOPS.has(cfop);
}

export function isPisNaoTributado(cst: string): boolean {
  return PIS_NT.has(cst);
}

export function defaultFinNFe(cfop: string): '1' | '4' {
  return isDevolucaoCfop(cfop) ? '4' : '1';
}

export function defaultPagFor(finNFe: string, cfop: string): { tPag: string; indPag: '0' | '1' } {
  if (finNFe === '3' || finNFe === '4' || isSemPagamentoCfop(cfop)) {
    return { tPag: '90', indPag: '0' };
  }
  return { tPag: DEFAULT_TPAG_VENDA, indPag: DEFAULT_INDPAG_VENDA };
}

export function defaultInfCpl(cfop: string, current?: string): string | undefined {
  if (current?.trim()) return current;
  return isVendaCfop(cfop) ? INF_CPL_ICMS_CONV_199 : undefined;
}

export function defaultInfAdFisco(cfop: string, current?: string): string | undefined {
  if (current?.trim()) return current;
  return isVendaCfop(cfop) ? INF_AD_FISCO_SINIEF : undefined;
}
