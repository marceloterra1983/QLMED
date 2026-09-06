/**
 * SPEC-047 — normalização dos sinais de um item de NF-e recebida.
 * Funções puras; a cascata (match.ts) e os testes dependem só daqui.
 */

/** upper + trim + só [A-Z0-9]. `001-MOZ 25.014` → `001MOZ25014`. */
export function normalizeSupplierCode(raw: string | null | undefined): string {
  return (raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Sem zeros à esquerda (`0005079` → `5079`); vazio se só zeros. */
export function stripLeadingZeros(norm: string): string {
  return norm.replace(/^0+/, '');
}

/**
 * Variantes de prefixo numérico: fornecedores como a DOC MED emitem
 * `001MOZ25014` para a referência `MOZ25014`. Devolve os sufixos obtidos ao
 * remover 1..3 dígitos iniciais, do mais curto ao mais longo, só quando o
 * resto ainda tem >= 4 caracteres (evita casar lixo curto).
 */
export function numericPrefixVariants(norm: string): string[] {
  const out: string[] = [];
  for (let n = 1; n <= 3; n++) {
    if (norm.length - n < 4) break;
    if (!/^[0-9]/.test(norm.slice(n - 1, n))) break;
    out.push(norm.slice(n));
  }
  return out;
}

/** GTIN válido: só dígitos, 8/12/13/14 posições, não é `SEM GTIN` nem zeros. */
export function normalizeEan(raw: string | null | undefined): string | null {
  const value = (raw || '').trim();
  if (!value || /SEM\s*GTIN/i.test(value)) return null;
  const digits = value.replace(/\D/g, '');
  if (digits.length !== value.length) return null;
  if (![8, 12, 13, 14].includes(digits.length)) return null;
  if (/^0+$/.test(digits)) return null;
  return digits;
}

/** Registro ANVISA = 11 dígitos. */
export function normalizeAnvisa(raw: string | null | undefined): string | null {
  const digits = (raw || '').replace(/\D/g, '');
  return digits.length === 11 ? digits : null;
}

/** NCM só dígitos (8) ou null. */
export function normalizeNcm(raw: string | null | undefined): string | null {
  const digits = (raw || '').replace(/\D/g, '');
  return digits.length === 8 ? digits : null;
}

/** CNPJ só dígitos. */
export function normalizeCnpj(raw: string | null | undefined): string {
  return (raw || '').replace(/\D/g, '');
}

/**
 * Descrição para comparação: sem acento, minúscula, remove ruído de rastro
 * que fornecedores concatenam no xProd (`LT:123`, `VAL:31/12/2099`,
 * `Posicao: 000`), colapsa espaços.
 */
export function normalizeDescription(raw: string | null | undefined): string {
  return (raw || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/posicao:\s*\d+/g, ' ')
    .replace(/\b(lt|lote|val|fab|ser|serie|sn)\s*[:.]\s*\S+/g, ' ')
    .replace(/\bcodigo\s*ms\s*[:.]\s*\S+/g, ' ')
    .replace(/\bcnpj\s*[:.]\s*\S+/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Trigramas com a semântica do pg_trgm: cada palavra recebe dois espaços à
 * esquerda e um à direita; similaridade = |A∩B| / |A∪B|.
 */
export function trigrams(text: string): Set<string> {
  const out = new Set<string>();
  for (const word of text.split(' ')) {
    if (!word) continue;
    const padded = `  ${word} `;
    for (let i = 0; i + 3 <= padded.length; i++) out.add(padded.slice(i, i + 3));
  }
  return out;
}

export function trigramSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const ta = trigrams(a);
  const tb = trigrams(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  const union = ta.size + tb.size - inter;
  return union === 0 ? 0 : inter / union;
}

/**
 * Nome de fornecedor para comparação com `default_supplier` /
 * `manufacturer_short_name` do Spica (que são abreviados e sem CNPJ).
 */
export function normalizeSupplierName(raw: string | null | undefined): string {
  return normalizeDescription(raw)
    .replace(/\b(ltda|eireli|epp|me|sa|s a|cia|com|comercio|comercial|imp|importacao|exp|exportacao|dist|distribuicao|distribuidora|ind|industria|prod|produtos|medicos|hospitalares|hosp|de|e|do|da|dos|das|repres|representacoes)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Variante OCR comum em cProd de instrumentos: letra O no lugar de zero
 * (`BBX800O-RK` → `BBX8000RK`). Só O→0 (não o inverso), para não explodir
 * o espaço de busca.
 */
export function ocrLetterOToZero(norm: string): string | null {
  if (!norm || !/[O]/.test(norm) || !/[0-9]/.test(norm)) return null;
  // Só O adjacente a dígito (`800O`→`8000`); não toca "MOZ".
  const out = norm.replace(/(?<=\d)O|O(?=\d)/g, '0');
  return out === norm ? null : out;
}

/**
 * Referências Spica embutidas no xProd quando o cProd é código interno do
 * fornecedor (LABCOR `207.01` → texto `P-201023A` / `DOKIMOS PLUS-A 25`).
 * Devolve códigos já normalizados ([A-Z0-9]).
 */
export function extractEmbeddedRefs(description: string | null | undefined): string[] {
  const raw = description || '';
  if (!raw.trim()) return [];
  const u = raw.toUpperCase();
  const out = new Set<string>();
  let m: RegExpExecArray | null;

  const reDok = /DOKIMOS\s*PLUS\s*-?\s*([AM])\s*-?\s*(\d{2})\s*([AM])?/g;
  while ((m = reDok.exec(u))) {
    const line = m[1];
    const size = m[2];
    const suffix = m[3] || line;
    out.add(normalizeSupplierCode(`DOKIMOS PLUS -${line} ${size}${suffix}`));
  }

  const reP = /P-?2010\s*-?\s*(\d{2})\s*([AM])/g;
  while ((m = reP.exec(u))) {
    out.add(normalizeSupplierCode(`P-2010${m[1]}${m[2]}`));
  }

  const reI = /INSTAR\s*-?\s*(\d{2})/g;
  while ((m = reI.exec(u))) {
    out.add(normalizeSupplierCode(`INSTAR-${m[1]}`));
  }

  const reE = /EAIVP?E?\s*-?\s*TIV\s*-?\s*(\d{2})/g;
  while ((m = reE.exec(u))) {
    out.add(normalizeSupplierCode(`EAIVPe-TIV-${m[1]}`));
  }

  // Catálogo entre parênteses: `BT 712 TOP (04051)`.
  const rePar = /\(([A-Z0-9][A-Z0-9.\-\/]{3,})\)/g;
  while ((m = rePar.exec(u))) {
    const tok = normalizeSupplierCode(m[1]);
    if (tok.length >= 4) out.add(tok);
  }

  // Código Spica explícito no texto: `AR-10003`, `AAVLM30` (já coberto por
  // leading-ref em S5a quando no início). Aqui só padrão letra(s)+hífen+dígitos.
  const reHyphen = /\b([A-Z]{1,6}-\d{3,6}[A-Z]?)\b/g;
  while ((m = reHyphen.exec(u))) {
    out.add(normalizeSupplierCode(m[1]));
  }

  return [...out].filter((t) => t.length >= 4);
}

/**
 * Remove prefixo de referência Spica no início da descrição normalizada
 * (`ti002 4112 004 parafuso...` → `parafuso...`) para comparação S7.
 */
export function stripLeadingCatalogFromDescription(descNorm: string): string {
  return descNorm.replace(/^[a-z]{1,4}\d+(?:\s+\d+){0,4}\s+/, '').trim();
}
