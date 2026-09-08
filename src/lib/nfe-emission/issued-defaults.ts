/** Defaults copiados das NF-e já autorizadas (série 2, CRT 3, 30d/2026-08). */

export const DEFAULT_SERIES = '2';
export const DEFAULT_MOD_FRETE = '0';
export const DEFAULT_IND_PRES = '9';
/** NT 2020.006: sem intermediador (site/canal próprio). Marketplace = '1'. */
export const DEFAULT_IND_INTERMED = '0';
export const IND_PRES_REQUIRES_INTERMED = ['2', '3', '4', '9'] as const;
export const DEFAULT_TPAG_VENDA = '15';
export const DEFAULT_INDPAG_VENDA = '1';
export const DEFAULT_PIS_CST = '01';
export const DEFAULT_PIS_ALIQUOTA = '0.6500';
export const DEFAULT_COFINS_ALIQUOTA = '3.0000';
export const DEFAULT_ICMS_CST_ISENTO = '40';

/** IBS/CBS 2026 (NT 2025.002 + LC 214/2025 art. 131). DNA: NF-e 65248. */
export const IBS_CST = '200';
export const IBS_CCLASS_TRIB = '200030';
export const IBS_P_UF = '0.10';
export const IBS_P_MUN = '0.00';
export const IBS_P_CBS = '0.90';
export const IBS_P_RED = '60.00';
export const JOINNER_CNPJ = '73008138000100';
export const EMIT_FONE = '6733263520';

export const INF_AD_FISCO_SINIEF =
  'Procedimento autorizado pelo Ajuste SINIEF 02/24';

/** Responsável técnico do emissor QLMED (NT 2018.005). Não usar dados da Joinner.
 *  fone = telefone do emitente nas NF-e série 2 autorizadas. */
export const INF_RESP_TEC = {
  xContato: 'Marcelo',
  email: 'marcelo@qlmed.com.br',
  fone: '6733263520',
} as const;

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

export function requiresIndIntermed(indPres: string, tpNf = '1', finNFe = '1'): boolean {
  return tpNf === '1' && finNFe === '1' && (IND_PRES_REQUIRES_INTERMED as readonly string[]).includes(indPres);
}
