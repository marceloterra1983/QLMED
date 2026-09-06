/**
 * SPEC-047 — cascata determinística item de NF-e recebida → produto Spica.
 * Sem I/O: recebe o catálogo indexado e a memória S6 e devolve a decisão.
 * Pára na primeira estratégia com candidato ÚNICO; ambíguo = pendente.
 */
import {
  extractEmbeddedRefs,
  normalizeAnvisa,
  normalizeCnpj,
  normalizeDescription,
  normalizeEan,
  normalizeNcm,
  normalizeSupplierCode,
  normalizeSupplierName,
  numericPrefixVariants,
  ocrLetterOToZero,
  stripLeadingCatalogFromDescription,
  stripLeadingZeros,
  trigramSimilarity,
} from './normalize';

export type MatchStrategy = 'S1' | 'S2' | 'S3' | 'S4' | 'S5' | 'S6' | 'S7' | 'MANUAL';

export interface RegistryProduct {
  id: string;
  codigo: string | null;
  code: string | null;
  productRefs: string[];
  ean: string | null;
  anvisaCode: string | null;
  ncm: string | null;
  description: string;
  defaultSupplier: string | null;
  manufacturerShortName: string | null;
}

export interface LinkItemInput {
  supplierCnpj: string;
  supplierName: string | null;
  supplierCode: string;
  description: string | null;
  ean: string | null;
  anvisa: string | null;
  ncm: string | null;
}

export interface MatchDecision {
  productId: string;
  codigo: string | null;
  strategy: MatchStrategy;
  confidence: number;
}

export interface MemoryEntry {
  productId: string;
  strategy: MatchStrategy;
  confidence: number;
}

/** chave da memória S6 */
export function memoryKey(supplierCnpj: string, supplierCode: string): string {
  return `${normalizeCnpj(supplierCnpj)}::${normalizeSupplierCode(supplierCode)}`;
}

export type LinkMemory = Map<string, MemoryEntry>;

interface IndexedProduct extends RegistryProduct {
  descNorm: string;
  descBody: string;
  supplierNorm: string;
  manufacturerNorm: string;
  ncmNorm: string | null;
}

export interface RegistryIndex {
  byId: Map<string, IndexedProduct>;
  byCodigo: Map<string, string[]>;
  byCodeNorm: Map<string, string[]>;
  byCodeNormNoZeros: Map<string, string[]>;
  byEan: Map<string, string[]>;
  byAnvisa: Map<string, string[]>;
  byNcm: Map<string, string[]>;
  size: number;
}

function push(map: Map<string, string[]>, key: string, id: string) {
  if (!key) return;
  const list = map.get(key);
  if (!list) map.set(key, [id]);
  else if (!list.includes(id)) list.push(id);
}

export function buildRegistryIndex(products: RegistryProduct[]): RegistryIndex {
  const index: RegistryIndex = {
    byId: new Map(),
    byCodigo: new Map(),
    byCodeNorm: new Map(),
    byCodeNormNoZeros: new Map(),
    byEan: new Map(),
    byAnvisa: new Map(),
    byNcm: new Map(),
    size: products.length,
  };
  for (const p of products) {
    const descNorm = normalizeDescription(p.description);
    const indexed: IndexedProduct = {
      ...p,
      descNorm,
      descBody: stripLeadingCatalogFromDescription(descNorm),
      supplierNorm: normalizeSupplierName(p.defaultSupplier),
      manufacturerNorm: normalizeSupplierName(p.manufacturerShortName),
      ncmNorm: normalizeNcm(p.ncm),
    };
    index.byId.set(p.id, indexed);
    if (p.codigo) push(index.byCodigo, p.codigo.trim(), p.id);
    const refs = new Set<string>([p.code || '', ...(p.productRefs || [])].map(normalizeSupplierCode).filter(Boolean));
    for (const ref of refs) {
      push(index.byCodeNorm, ref, p.id);
      push(index.byCodeNormNoZeros, stripLeadingZeros(ref), p.id);
    }
    const ean = normalizeEan(p.ean);
    if (ean) push(index.byEan, ean, p.id);
    const anvisa = normalizeAnvisa(p.anvisaCode);
    if (anvisa) push(index.byAnvisa, anvisa, p.id);
    if (indexed.ncmNorm) push(index.byNcm, indexed.ncmNorm, p.id);
  }
  return index;
}

function unique(list: string[] | undefined): string | null {
  return list && list.length === 1 ? list[0] : null;
}

function decide(index: RegistryIndex, productId: string, strategy: MatchStrategy, confidence: number): MatchDecision {
  return { productId, codigo: index.byId.get(productId)?.codigo ?? null, strategy, confidence };
}

export const S5_SIMILARITY_THRESHOLD = 0.85;
export const S6_AUTO_MIN_CONFIDENCE = 0.9;

/**
 * S5b: modelos Spica embutidos no xProd (LABCOR DOKIMOS/P-2010/INSTAR/TIV).
 * Candidato único via code/product_refs normalizado.
 */
function matchByEmbeddedRef(item: LinkItemInput, index: RegistryIndex): MatchDecision | null {
  const refs = extractEmbeddedRefs(item.description);
  if (refs.length === 0) return null;
  const hits = new Set<string>();
  for (const ref of refs) {
    const list = index.byCodeNorm.get(ref);
    if (list) for (const id of list) hits.add(id);
  }
  if (hits.size !== 1) return null;
  return decide(index, [...hits][0], 'S5', 0.92);
}

/**
 * S7: descrição NF-e contida na descrição Spica (ou vice-versa) após
 * normalizar e remover prefixo de catálogo Spica, com ratio >= 0,85 e NCM
 * igual quando ambos têm NCM. Sem fuzzy frouxo — evita parafuso 02,0↔02,3.
 */
function matchByDescriptionContainment(item: LinkItemInput, index: RegistryIndex): MatchDecision | null {
  const dn = normalizeDescription(item.description);
  if (dn.length < 12) return null;
  const ncm = normalizeNcm(item.ncm);
  // NCM obrigatório em S7: sem ele a contenção vira fuzzy frouxo entre famílias.
  if (!ncm) return null;
  const supplier = normalizeSupplierName(item.supplierName);
  const withSupplier: string[] = [];
  const highRatio: string[] = [];
  for (const p of index.byId.values()) {
    if (p.ncmNorm !== ncm) continue;
    const body = p.descBody || p.descNorm;
    if (!body || body.length < 12) continue;
    const shorter = dn.length <= body.length ? dn : body;
    const longer = dn.length <= body.length ? body : dn;
    if (!longer.includes(shorter)) continue;
    const ratio = shorter.length / longer.length;
    if (ratio < 0.85) continue;
    const sameSupplier = !!supplier && (
      (p.supplierNorm && (supplier.includes(p.supplierNorm) || p.supplierNorm.includes(supplier)))
      || (p.manufacturerNorm && supplier.includes(p.manufacturerNorm))
    );
    if (sameSupplier) withSupplier.push(p.id);
    else if (ratio >= 0.92) highRatio.push(p.id);
  }
  // Preferência: mesmo fornecedor/fabricante; senão contenção quase exacta
  // (distribuidor ≠ fabricante Spica, ex. RCA → Techimport).
  if (withSupplier.length === 1) return decide(index, withSupplier[0], 'S7', 0.93);
  if (withSupplier.length > 1) return null;
  if (highRatio.length === 1) return decide(index, highRatio[0], 'S7', 0.91);
  return null;
}

/**
 * S5a: o xProd começa pela referência Spica (`HA60-CARTUCHO...`, `AA10 -DISPOSITIVO`),
 * padrão de fornecedores que usam código interno numérico no cProd. Exige
 * candidato único e NCM igual quando ambos os lados têm NCM.
 */
function matchByLeadingReference(item: LinkItemInput, index: RegistryIndex): MatchDecision | null {
  const desc = (item.description || '').trim().toUpperCase();
  if (!desc) return null;
  // Prefixos terminados num separador, do mais longo ao mais curto:
  // `AT-01-SISTEMA ...` → `AT-01-SISTEMA`, `AT-01`, `AT`; `HA60-CARTUCHO` → `HA60-CARTUCHO`, `HA60`.
  const head = desc.slice(0, 24);
  const candidates: Array<{ token: string; explicitSeparator: boolean }> = [];
  for (let i = 1; i <= head.length; i++) {
    const sep = head[i];
    const atEnd = i === head.length;
    if (!atEnd && !/[-–:\s]/.test(sep)) continue;
    const prefix = head.slice(0, i);
    if (!/^[A-Z0-9][A-Z0-9.\-\/]*$/.test(prefix)) break;
    const rest = desc.slice(i);
    const explicitSeparator = /^\s*[-–:]/.test(rest);
    if (!atEnd && !explicitSeparator && !/^\s/.test(rest)) continue;
    candidates.push({ token: prefix, explicitSeparator });
  }
  const ncm = normalizeNcm(item.ncm);
  let previous: string | null = null;
  for (const { token: rawToken, explicitSeparator } of candidates.reverse()) {
    // Só recua para um prefixo mais curto se o que caiu é palavra de descrição
    // (`CARTUCHO`), nunca sufixo de variante (`AT-01-S` → `AT-01` seria chute).
    if (previous) {
      const dropped = previous.slice(rawToken.length);
      if (!/[A-Z]{3,}/.test(dropped) || /[0-9]/.test(dropped)) break;
    }
    previous = rawToken;
    const token = normalizeSupplierCode(rawToken);
    if (token.length < 4) continue;
    const hasDigit = /[0-9]/.test(token);
    const hasLetter = /[A-Z]/.test(token);
    // Palavra pura ("CATETER") nunca é referência; número puro só com separador
    // explícito e >= 6 dígitos (código Spica), senão é tamanho/quantidade.
    if (!hasDigit) continue;
    if (!hasLetter && !(explicitSeparator && token.length >= 6)) continue;
    const id = unique(index.byCodeNorm.get(token));
    if (!id) continue;
    const p = index.byId.get(id)!;
    if (ncm && p.ncmNorm && ncm !== p.ncmNorm) continue;
    return decide(index, id, 'S5', 0.88);
  }
  return null;
}

/** S5: mesmo fornecedor + NCM igual + descrição muito parecida, candidato único acima do limiar. */
function matchByDescription(item: LinkItemInput, index: RegistryIndex): MatchDecision | null {
  const ncm = normalizeNcm(item.ncm);
  if (!ncm) return null;
  const candidates = index.byNcm.get(ncm);
  if (!candidates || candidates.length === 0) return null;
  const supplier = normalizeSupplierName(item.supplierName);
  if (!supplier) return null;
  const desc = normalizeDescription(item.description);
  if (desc.length < 8) return null;

  let best: { id: string; score: number } | null = null;
  let second = 0;
  for (const id of candidates) {
    const p = index.byId.get(id)!;
    const sameSupplier = (p.supplierNorm && (supplier.includes(p.supplierNorm) || p.supplierNorm.includes(supplier)))
      || (p.manufacturerNorm && supplier.includes(p.manufacturerNorm));
    if (!sameSupplier) continue;
    const score = trigramSimilarity(desc, p.descNorm);
    if (!best || score > best.score) {
      second = best?.score ?? 0;
      best = { id, score };
    } else if (score > second) {
      second = score;
    }
  }
  if (!best || best.score < S5_SIMILARITY_THRESHOLD) return null;
  // Dois candidatos igualmente bons = ambíguo.
  if (second >= S5_SIMILARITY_THRESHOLD && Math.abs(best.score - second) < 0.02) return null;
  return decide(index, best.id, 'S5', Math.min(0.9, Number(best.score.toFixed(3))));
}

/**
 * Ordem: S6 (memória MANUAL) → S1 → S2 (exato, sem zeros, OCR O→0, sem
 * prefixo) → S3 (EAN) → S4 (ANVISA) → S5 (ref embutida / leading / trigram)
 * → S7 (contenção de descrição + NCM) → S6 (memória automática ≥ 0,9).
 * A memória MANUAL vem primeiro porque é decisão humana explícita.
 */
export function matchItem(item: LinkItemInput, index: RegistryIndex, memory?: LinkMemory): MatchDecision | null {
  const key = memoryKey(item.supplierCnpj, item.supplierCode);
  const remembered = memory?.get(key);
  if (remembered && remembered.strategy === 'MANUAL' && index.byId.has(remembered.productId)) {
    return decide(index, remembered.productId, 'S6', 1);
  }

  const raw = (item.supplierCode || '').trim();
  const s1 = unique(index.byCodigo.get(raw));
  if (s1) return decide(index, s1, 'S1', 1);

  const norm = normalizeSupplierCode(raw);
  if (norm) {
    const exact = unique(index.byCodeNorm.get(norm));
    if (exact) return decide(index, exact, 'S2', 0.98);
    // Zeros à esquerda de qualquer lado: `0005079` ↔ `5079`.
    const noZeros = stripLeadingZeros(norm);
    if (noZeros) {
      const nz = unique(index.byCodeNormNoZeros.get(noZeros));
      if (nz) return decide(index, nz, 'S2', 0.95);
    }
    // OCR: O → 0 em códigos alfanuméricos (`BBX800O-RK` → `BBX8000RK`).
    const ocr = ocrLetterOToZero(norm);
    if (ocr) {
      const ocrHit = unique(index.byCodeNorm.get(ocr));
      if (ocrHit) return decide(index, ocrHit, 'S2', 0.94);
    }
    if (!index.byCodeNorm.has(norm)) {
      for (const variant of numericPrefixVariants(norm)) {
        const list = index.byCodeNorm.get(variant);
        if (!list) continue;
        const v = unique(list);
        if (v) return decide(index, v, 'S2', 0.9);
        break; // variante existe mas é ambígua: não tentar prefixos maiores
      }
    }
  }

  const ean = normalizeEan(item.ean);
  if (ean) {
    const s3 = unique(index.byEan.get(ean));
    if (s3) return decide(index, s3, 'S3', 0.95);
  }

  const anvisa = normalizeAnvisa(item.anvisa);
  if (anvisa) {
    const s4 = unique(index.byAnvisa.get(anvisa));
    if (s4) return decide(index, s4, 'S4', 0.9);
  }

  const s5 = matchByEmbeddedRef(item, index)
    ?? matchByLeadingReference(item, index)
    ?? matchByDescription(item, index);
  if (s5) return s5;

  const s7 = matchByDescriptionContainment(item, index);
  if (s7) return s7;

  if (remembered && remembered.strategy !== 'MANUAL' && remembered.confidence >= S6_AUTO_MIN_CONFIDENCE && index.byId.has(remembered.productId)) {
    return decide(index, remembered.productId, 'S6', Math.min(remembered.confidence, 0.9));
  }

  return null;
}
