import { padSpicaCodigo } from '@/lib/product-codigo-format';

export { padSpicaCodigo };

/**
 * Parsers puros do export Spica (Rel_Produtos / List_Produtos_Cad).
 * Sem I/O — só normalização de campos medidos no research 043.
 */

const TIPO_PREFIX = /^\d+\s*[-–]\s*/;

/** Tipos Spica válidos (após strip do prefixo numérico). */
export const SPICA_TIPO_MAP: Record<string, string> = {
  CARDIACA: 'CARDIACA',
  HEMODINAMICA: 'HEMODINAMICA',
  ORTOPEDIA: 'ORTOPEDIA',
  OUTROS: 'OUTROS',
  EQUIPAMENTOS: 'EQUIPAMENTOS',
  'FORA DE LINHA - HEMOD.': 'HEMODINAMICA',
  'FORA DE LINHA - CARDIACA': 'CARDIACA',
  'FORA DE LINHA - CRM': 'CRM',
};

export function parseBrNumber(raw: string | null | undefined): number | null {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  // milhar BR: 1.234,56 → remove pontos de milhar, vírgula → ponto
  const normalized = s.replace(/\./g, '').replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;
  const [intPart, frac = ''] = normalized.split('.');
  const fracPadded = (frac + '0000').slice(0, 4);
  const asInt = Number(intPart) * 10000 + Number(fracPadded);
  if (!Number.isFinite(asInt)) return null;
  const value = asInt / 10000;
  return value;
}

/** Percentual 0–100; fora da faixa ou inválido → null. */
export function parseBrPercent(raw: string | null | undefined): number | null {
  const n = parseBrNumber(raw);
  if (n == null) return null;
  if (n < 0 || n > 100) return null;
  return n;
}

export function normalizeSpicaRef(value: string | null | undefined): string {
  return String(value ?? '').trim();
}

export function isInvalidSpicaRef(ref: string): boolean {
  const t = ref.trim();
  return t === '' || t === '_';
}

/** Situação Tributária Spica = origem(1) + CST-ICMS(2). */
export function splitSitTributaria(raw: string | null | undefined): {
  sitTributaria: string | null;
  origem: string | null;
  cstIcms: string | null;
} {
  const digits = String(raw ?? '').replace(/\D/g, '');
  if (digits.length < 3) {
    return { sitTributaria: digits || null, origem: null, cstIcms: null };
  }
  const sit = digits.slice(0, 3);
  return { sitTributaria: sit, origem: sit[0], cstIcms: sit.slice(1) };
}

export function normalizeAnvisaRvs(raw: string | null | undefined): string | null {
  const digits = String(raw ?? '').replace(/\D/g, '');
  return digits.length === 11 ? digits : null;
}

export function normalizeNcm(raw: string | null | undefined): string | null {
  const digits = String(raw ?? '').replace(/\D/g, '');
  return digits.length === 8 ? digits : null;
}

export function parseInstrumental(raw: string | null | undefined): boolean {
  return String(raw ?? '').trim().toLowerCase() === 'sim';
}

export function parseTipoSpica(tipoRaw: string | null | undefined): {
  productType: string | null;
  outOfLine: boolean;
  invalid: boolean;
  tipoStripped: string;
} {
  const raw = String(tipoRaw ?? '').trim();
  const stripped = raw.replace(TIPO_PREFIX, '').trim();
  const outOfLine = /FORA\s+DE\s+LINHA/i.test(raw);
  if (!TIPO_PREFIX.test(raw) && raw !== '') {
    // sem prefixo N - → inválido (MEDTRONIC etc.), salvo string vazia
    return { productType: null, outOfLine, invalid: true, tipoStripped: stripped };
  }
  if (!stripped) {
    return { productType: null, outOfLine, invalid: false, tipoStripped: '' };
  }
  const mapped = SPICA_TIPO_MAP[stripped] ?? SPICA_TIPO_MAP[stripped.toUpperCase()];
  if (mapped) {
    return { productType: mapped, outOfLine, invalid: false, tipoStripped: stripped };
  }
  // prefixo numérico ok mas não está no mapa — guarda stripped (ex. CRM já mapeado)
  if (outOfLine) {
    const rest = stripped.replace(/^FORA\s+DE\s+LINHA\s*[-–]?\s*/i, '').trim();
    const restMap: Record<string, string> = {
      'HEMOD.': 'HEMODINAMICA',
      HEMOD: 'HEMODINAMICA',
      HEMODINAMICA: 'HEMODINAMICA',
      CARDIACA: 'CARDIACA',
      CRM: 'CRM',
    };
    const m = restMap[rest] ?? restMap[rest.toUpperCase()] ?? (rest || null);
    return { productType: m, outOfLine: true, invalid: false, tipoStripped: stripped };
  }
  return { productType: stripped, outOfLine: false, invalid: false, tipoStripped: stripped };
}

export interface SpicaRelRowInput {
  codigo: string;
  referencia: string;
  nome: string;
  tipo: string;
  subtipo: string;
  fabricante: string;
  fornecedor?: string;
  instrumental: string;
  rvs: string;
  ncm: string;
  sitTributaria: string;
  nomeTributacao: string;
  icms: string;
  pis: string;
  cofins: string;
  ipiEntrada: string;
  ipiSaida?: string;
  obsFiscal?: string;
}

export interface SpicaNormalizedRow {
  codigo: string;
  referencia: string;
  refInvalid: boolean;
  nome: string;
  /** Linha QLMED — mesma taxonomia do Tipo Spica (ex.: ORTOPEDIA). */
  productType: string | null;
  /** Grupo QLMED — Tipo Spica (instrução: Tipo = Grupo). */
  productSubtype: string | null;
  /** Subgrupo QLMED — Sub/SubTipo Spica (instrução: Subtipo = Subgrupo). */
  productSubgroup: string | null;
  outOfLine: boolean;
  tipoInvalid: boolean;
  manufacturerShortName: string | null;
  defaultSupplier: string | null;
  instrumental: boolean;
  anvisaCode: string | null;
  anvisaInvalid: boolean;
  ncm: string | null;
  fiscalSitTributaria: string | null;
  fiscalOrigem: string | null;
  fiscalNomeTributacao: string | null;
  fiscalIcms: number | null;
  fiscalPis: number | null;
  fiscalCofins: number | null;
  fiscalIpi: number | null;
  fiscalObs: string | null;
  ipiSaidaNaoZero: boolean;
  fiscalInconsistente: boolean;
}

export function normalizeSpicaRelRow(row: SpicaRelRowInput): SpicaNormalizedRow {
  const codigo = padSpicaCodigo(row.codigo);
  if (!codigo) {
    throw new Error('codigo Spica obrigatorio');
  }
  const referencia = normalizeSpicaRef(row.referencia);
  const tipo = parseTipoSpica(row.tipo);
  const sit = splitSitTributaria(row.sitTributaria);
  const anvisa = normalizeAnvisaRvs(row.rvs);
  const fiscalIcms = parseBrPercent(row.icms);
  const nomeTrib = String(row.nomeTributacao ?? '').trim() || null;
  const fiscalInconsistente =
    (sit.sitTributaria === '000' && fiscalIcms === 0) ||
    (sit.sitTributaria === '000' && !!nomeTrib && /ISENTO/i.test(nomeTrib));

  const ipiSaida = parseBrPercent(row.ipiSaida);
  return {
    codigo,
    referencia,
    refInvalid: isInvalidSpicaRef(referencia),
    nome: String(row.nome ?? '').trim(),
    // Spica Tipo → Linha + Grupo; Spica Sub/SubTipo → Subgrupo
    productType: tipo.invalid ? null : tipo.productType,
    productSubtype: tipo.invalid ? null : tipo.productType,
    productSubgroup: tipo.invalid ? null : String(row.subtipo ?? '').trim() || null,
    outOfLine: tipo.outOfLine,
    tipoInvalid: tipo.invalid,
    manufacturerShortName: String(row.fabricante ?? '').trim() || null,
    defaultSupplier: String(row.fornecedor ?? '').trim() || null,
    instrumental: parseInstrumental(row.instrumental),
    anvisaCode: anvisa,
    anvisaInvalid: String(row.rvs ?? '').replace(/\D/g, '').length > 0 && !anvisa,
    ncm: normalizeNcm(row.ncm),
    fiscalSitTributaria: sit.sitTributaria,
    fiscalOrigem: sit.origem,
    fiscalNomeTributacao: nomeTrib,
    fiscalIcms,
    fiscalPis: parseBrPercent(row.pis),
    fiscalCofins: parseBrPercent(row.cofins),
    fiscalIpi: parseBrPercent(row.ipiEntrada),
    fiscalObs: String(row.obsFiscal ?? '').trim() || null,
    ipiSaidaNaoZero: ipiSaida != null && ipiSaida !== 0,
    fiscalInconsistente,
  };
}
