import { NextResponse } from 'next/server';
import { requireEditor, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import { ensureProductRegistryTable } from '@/lib/product-registry-store';
import prisma from '@/lib/prisma';

/* ── helpers ── */

function norm(s: string | null | undefined): string {
  return (s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function tokens(s: string): string[] {
  return norm(s).split(/[\s/,;.\-_()]+/).filter((t) => t.length >= 3);
}

/** Dice coefficient between two token sets (0..1) */
function dice(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setB = new Set(b);
  let intersection = 0;
  for (const t of a) if (setB.has(t)) intersection++;
  return (2 * intersection) / (a.length + b.length);
}

/* ── NCM → tipo mapping (broad categories) ── */
const NCM_TYPE_MAP: Record<string, { tipo: string; subtipo?: string }> = {
  '3001': { tipo: 'Medicamentos', subtipo: 'Matéria-prima Biológica' },
  '3002': { tipo: 'Medicamentos', subtipo: 'Vacinas e Hemoderivados' },
  '3003': { tipo: 'Medicamentos', subtipo: 'Medicamento' },
  '3004': { tipo: 'Medicamentos', subtipo: 'Medicamento' },
  '3005': { tipo: 'Materiais Hospitalares', subtipo: 'Curativos e Adesivos' },
  '3006': { tipo: 'Materiais Hospitalares', subtipo: 'Preparações Farmacêuticas' },
  '3822': { tipo: 'Diagnóstico', subtipo: 'Reagente de Diagnóstico' },
  '4014': { tipo: 'Materiais Hospitalares', subtipo: 'Artigos de Borracha para Higiene' },
  '4015': { tipo: 'Materiais Hospitalares', subtipo: 'Luvas e Acessórios de Borracha' },
  '9018': { tipo: 'Dispositivos Médicos', subtipo: 'Instrumento ou Aparelho Médico-cirúrgico' },
  '9019': { tipo: 'Dispositivos Médicos', subtipo: 'Aparelho de Mecanoterapia' },
  '9021': { tipo: 'Dispositivos Médicos', subtipo: 'Prótese ou Órtese' },
  '9022': { tipo: 'Diagnóstico', subtipo: 'Equipamento de Raio-X' },
  '9027': { tipo: 'Diagnóstico', subtipo: 'Instrumento de Análise' },
  '7010': { tipo: 'Materiais Hospitalares', subtipo: 'Vidraria' },
  '7017': { tipo: 'Materiais Hospitalares', subtipo: 'Vidraria Laboratório' },
  '3923': { tipo: 'Materiais Hospitalares', subtipo: 'Artigos Plásticos' },
  '3926': { tipo: 'Materiais Hospitalares', subtipo: 'Artigos Plásticos' },
  '6210': { tipo: 'Materiais Hospitalares', subtipo: 'Vestuário de Proteção' },
  '6307': { tipo: 'Materiais Hospitalares', subtipo: 'Têxteis Descartáveis' },
  '8421': { tipo: 'Dispositivos Médicos', subtipo: 'Filtragem e Purificação' },
  '8413': { tipo: 'Dispositivos Médicos', subtipo: 'Bombas e Infusão' },
  '7326': { tipo: 'Materiais Hospitalares', subtipo: 'Artigos Metálicos' },
  '8479': { tipo: 'Dispositivos Médicos', subtipo: 'Máquina ou Aparelho Mecânico' },
};

/* ── description keyword → tipo hints ── */
const DESC_TYPE_HINTS: Array<{ patterns: RegExp; tipo: string; subtipo?: string }> = [
  { patterns: /\b(seringa|agulha|cateter|equipo|scalp|torneira|extensor|luer)\b/i, tipo: 'Materiais Hospitalares', subtipo: 'Material de Punção e Infusão' },
  { patterns: /\b(fio\s+(de\s+)?sutura|sutura|prolene|vicryl|mononylon|nylon\s+cirurg|poliglact)\b/i, tipo: 'Materiais Hospitalares', subtipo: 'Fios Cirúrgicos e Suturas' },
  { patterns: /\b(luva|luvas)\b/i, tipo: 'Materiais Hospitalares', subtipo: 'Luvas' },
  { patterns: /\b(gaze|compressa|atadura|esparadrapo|curativo|band[- ]?aid|micropore)\b/i, tipo: 'Materiais Hospitalares', subtipo: 'Curativos e Adesivos' },
  { patterns: /\b(mascara|mascaras|avental|touca|gorro|campo\s+cirurg|propé|prope)\b/i, tipo: 'Materiais Hospitalares', subtipo: 'Descartáveis e Paramentação' },
  { patterns: /\b(sonda|dreno|drain|coletor|bolsa\s+(de\s+)?colostom|urimed)\b/i, tipo: 'Materiais Hospitalares', subtipo: 'Sondas e Drenos' },
  { patterns: /\b(implante|protese|prótese|parafuso\s+(de\s+)?titânio|placa\s+(de\s+)?titânio|haste\s+intra|stent|endopr[oó]tese)\b/i, tipo: 'Dispositivos Médicos', subtipo: 'Implantes e Próteses' },
  { patterns: /\b(monitor|desfibril|eletrocard|ecg|ekg|oxímetro|oximetro|capnograf|ventilador\s+(pulmon|mecân))\b/i, tipo: 'Dispositivos Médicos', subtipo: 'Monitoramento e Suporte' },
  { patterns: /\b(bisturi|pinça|pinca|tesoura\s+(cirurg|metzen)|afastador|porta.?agulha|curetas|dilatador)\b/i, tipo: 'Dispositivos Médicos', subtipo: 'Instrumental Cirúrgico' },
  { patterns: /\b(reagente|kit\s+(de\s+)?diagnóstico|tira\s+(reag|test)|teste\s+rápido|imunocromatograf)\b/i, tipo: 'Diagnóstico', subtipo: 'Reagente de Diagnóstico' },
  { patterns: /\b(óculos|oculos|lente\s+(intra|de\s+contato)|viscoelast)\b/i, tipo: 'Dispositivos Médicos', subtipo: 'Oftalmologia' },
  { patterns: /\b(cimento\s+(ortop|ósseo)|enxerto|biomaterial|membrana\s+(biolog|regener))\b/i, tipo: 'Dispositivos Médicos', subtipo: 'Biomateriais' },
  { patterns: /\b(oxigên|oxigen|o2|ar\s+comprimido|n2o|co2\s+medic)\b/i, tipo: 'Gases Medicinais' },
  { patterns: /\b(álcool|alcool|clorexidina|iodo|povidona|desinfetante|glutaraldeído|ácido\s+peracético|hipoclorito)\b/i, tipo: 'Saneantes', subtipo: 'Desinfetantes e Antissépticos' },
  { patterns: /\b(comprimido|cápsula|capsula|xarope|solução\s+oral|suspensão\s+oral|injetável|injetavel|ampola\s+\d+\s*ml)\b/i, tipo: 'Medicamentos', subtipo: 'Medicamento' },
];

interface Product {
  key: string;
  code: string | null;
  description: string;
  ncm: string | null;
  unit: string | null;
  ean: string | null;
  anvisa: string | null;
  anvisaSource: string | null;
  productType: string | null;
  productSubtype: string | null;
  anvisaHolder: string | null;
  anvisaManufacturer: string | null;
  supplierCnpj: string | null;
  supplierName: string | null;
}

/**
 * POST /api/products/auto-classify
 * Analyzes all products and fills in missing ANVISA, type, subtype, manufacturer
 * by looking at similar products and using NCM/description heuristics.
 * Body: { dryRun?: boolean }
 */
export async function POST(req: Request) {
  try {
    let userId: string;
    try {
      const auth = await requireEditor();
      userId = auth.userId;
    } catch (e: any) {
      if (e.message === 'FORBIDDEN') return forbiddenResponse();
      return unauthorizedResponse();
    }

    const company = await getOrCreateSingleCompany(userId);
    const body = await req.json().catch(() => ({}));
    const dryRun = body?.dryRun === true;

    await ensureProductRegistryTable();

    // ── Load all products with their registry data ──
    // First, get all products from invoices (we need the products API data)
    // Instead of re-parsing XMLs, we'll work from the product_registry table
    // which already has products that were seen + any manual entries.
    // But we also need products that don't have a registry row yet.
    // The simplest approach: call our own products endpoint internally.
    // But since we're server-side, we'll build the product list from the DB.

    // Get all registry rows
    const registryRows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT id, product_key, code, description, ncm, unit, ean,
              anvisa_code, anvisa_source, product_type, product_subtype,
              anvisa_holder, anvisa_manufacturer
       FROM product_registry
       WHERE company_id = $1`,
      company.id,
    );

    // ── Build supplier map from invoices ──
    // Maps product code (uppercase) → { supplierCnpj, supplierName } from most recent invoice
    const supplierByCode = new Map<string, { cnpj: string; name: string }>();
    const invoicesForSupplier = await prisma.invoice.findMany({
      where: { companyId: company.id, type: 'NFE', direction: 'received' },
      orderBy: { issueDate: 'desc' },
      take: 2000,
      select: { senderCnpj: true, senderName: true, xmlContent: true },
    });

    // Quick extraction of product codes from XML (regex, no full parse)
    const codeRegex = /<cProd>\s*([^<]+)\s*<\/cProd>/gi;
    for (const inv of invoicesForSupplier) {
      if (!inv.xmlContent || !inv.senderCnpj) continue;
      const supplier = { cnpj: inv.senderCnpj, name: inv.senderName || '' };
      let match: RegExpExecArray | null;
      while ((match = codeRegex.exec(inv.xmlContent)) !== null) {
        const code = match[1].trim().toUpperCase();
        if (code && !supplierByCode.has(code)) {
          supplierByCode.set(code, supplier);
        }
      }
    }

    const products: Product[] = registryRows.map((r: any) => {
      const code = r.code || null;
      const sup = code ? supplierByCode.get(code.trim().toUpperCase()) : undefined;
      return {
        key: r.product_key,
        code,
        description: r.description || '',
        ncm: r.ncm || null,
        unit: r.unit || null,
        ean: r.ean || null,
        anvisa: r.anvisa_code || null,
        anvisaSource: r.anvisa_source || null,
        productType: r.product_type || null,
        productSubtype: r.product_subtype || null,
        anvisaHolder: r.anvisa_holder || null,
        anvisaManufacturer: r.anvisa_manufacturer || null,
        supplierCnpj: sup?.cnpj || null,
        supplierName: sup?.name || null,
      };
    });

    if (products.length === 0) {
      return NextResponse.json({ message: 'Nenhum produto encontrado no registro', stats: {} });
    }

    // ── Build indexes for matching ──
    // By ANVISA code
    const byAnvisa = new Map<string, Product[]>();
    // By NCM (4-digit prefix)
    const byNcmPrefix = new Map<string, Product[]>();
    // By supplier CNPJ
    const bySupplier = new Map<string, Product[]>();
    // By description tokens
    const descTokensMap = new Map<string, string[]>();

    for (const p of products) {
      if (p.anvisa) {
        const arr = byAnvisa.get(p.anvisa) || [];
        arr.push(p);
        byAnvisa.set(p.anvisa, arr);
      }
      if (p.supplierCnpj) {
        const arr = bySupplier.get(p.supplierCnpj) || [];
        arr.push(p);
        bySupplier.set(p.supplierCnpj, arr);
      }
      if (p.ncm && p.ncm.length >= 4) {
        const prefix = p.ncm.slice(0, 4);
        const arr = byNcmPrefix.get(prefix) || [];
        arr.push(p);
        byNcmPrefix.set(prefix, arr);
      }
      descTokensMap.set(p.key, tokens(p.description));
    }

    // ── Inference engine ──
    type Update = {
      key: string;
      id: string;
      fields: Record<string, string | null>;
      reason: string;
    };

    const updates: Update[] = [];
    const idMap = new Map(registryRows.map((r: any) => [r.product_key as string, r.id as string]));

    for (const p of products) {
      const pId = idMap.get(p.key);
      if (!pId) continue;

      const fieldsToSet: Record<string, string | null> = {};
      const reasons: string[] = [];

      // ── Strategy 1: Same ANVISA → copy type/subtype/manufacturer/holder ──
      if (p.anvisa) {
        const siblings = byAnvisa.get(p.anvisa) || [];
        for (const s of siblings) {
          if (s.key === p.key) continue;
          if (!p.productType && s.productType && !fieldsToSet.product_type) {
            fieldsToSet.product_type = s.productType;
            if (s.productSubtype && !p.productSubtype) fieldsToSet.product_subtype = s.productSubtype;
            reasons.push(`tipo copiado de produto com mesma ANVISA (${s.code || s.description.slice(0, 30)})`);
          }
          if (!p.anvisaManufacturer && s.anvisaManufacturer && !fieldsToSet.anvisa_manufacturer) {
            fieldsToSet.anvisa_manufacturer = s.anvisaManufacturer;
            reasons.push(`fabricante copiado de produto com mesma ANVISA`);
          }
          if (!p.anvisaHolder && s.anvisaHolder && !fieldsToSet.anvisa_holder) {
            fieldsToSet.anvisa_holder = s.anvisaHolder;
          }
          if (fieldsToSet.product_type && fieldsToSet.anvisa_manufacturer) break;
        }
      }

      // ── Strategy 2: Description similarity → copy ANVISA/type ──
      if (!p.anvisa || !p.productType) {
        const pTokens = descTokensMap.get(p.key) || [];
        if (pTokens.length >= 2) {
          let bestMatch: Product | null = null;
          let bestScore = 0;

          for (const other of products) {
            if (other.key === p.key) continue;
            // Must have something we need
            const hasNeeded = (!p.anvisa && other.anvisa) || (!p.productType && other.productType);
            if (!hasNeeded) continue;

            const oTokens = descTokensMap.get(other.key) || [];
            if (oTokens.length < 2) continue;

            let score = dice(pTokens, oTokens);

            // Boost if same NCM
            if (p.ncm && other.ncm && p.ncm === other.ncm) score = Math.min(score + 0.1, 0.99);
            // Boost if same unit
            if (p.unit && other.unit && norm(p.unit) === norm(other.unit)) score = Math.min(score + 0.05, 0.99);

            if (score > bestScore) {
              bestScore = score;
              bestMatch = other;
            }
          }

          // Require high similarity for ANVISA (0.75), lower for type (0.55)
          if (bestMatch && bestScore >= 0.55) {
            if (!p.productType && bestMatch.productType && !fieldsToSet.product_type) {
              fieldsToSet.product_type = bestMatch.productType;
              if (bestMatch.productSubtype && !p.productSubtype && !fieldsToSet.product_subtype) {
                fieldsToSet.product_subtype = bestMatch.productSubtype;
              }
              reasons.push(`tipo inferido por descrição similar (${(bestScore * 100).toFixed(0)}% "${bestMatch.description.slice(0, 40)}")`);
            }
            if (!p.anvisa && bestMatch.anvisa && bestScore >= 0.75) {
              fieldsToSet.anvisa_code = bestMatch.anvisa;
              fieldsToSet.anvisa_source = 'auto_infer';
              reasons.push(`ANVISA inferido por descrição similar (${(bestScore * 100).toFixed(0)}% "${bestMatch.description.slice(0, 40)}")`);
            }
          }
        }
      }

      // ── Strategy 2b: Same supplier + similar description → copy type/ANVISA ──
      if ((!p.productType || !p.anvisa) && p.supplierCnpj && !fieldsToSet.product_type) {
        const supplierProducts = bySupplier.get(p.supplierCnpj) || [];
        if (supplierProducts.length >= 2) {
          const pTokens = descTokensMap.get(p.key) || [];
          if (pTokens.length >= 2) {
            let bestMatch: Product | null = null;
            let bestScore = 0;

            for (const other of supplierProducts) {
              if (other.key === p.key) continue;
              const hasNeeded = (!p.productType && other.productType) || (!p.anvisa && other.anvisa && !fieldsToSet.anvisa_code);
              if (!hasNeeded) continue;
              const oTokens = descTokensMap.get(other.key) || [];
              if (oTokens.length < 2) continue;
              let score = dice(pTokens, oTokens);
              if (p.ncm && other.ncm && p.ncm === other.ncm) score = Math.min(score + 0.1, 0.99);
              if (score > bestScore) { bestScore = score; bestMatch = other; }
            }

            // Lower threshold for same-supplier matches (products from same supplier tend to be related)
            if (bestMatch && bestScore >= 0.45) {
              if (!p.productType && !fieldsToSet.product_type && bestMatch.productType) {
                fieldsToSet.product_type = bestMatch.productType;
                if (bestMatch.productSubtype && !p.productSubtype && !fieldsToSet.product_subtype) {
                  fieldsToSet.product_subtype = bestMatch.productSubtype;
                }
                reasons.push(`tipo copiado de produto do mesmo fornecedor ${p.supplierName || ''} (${(bestScore * 100).toFixed(0)}% "${bestMatch.description.slice(0, 30)}")`);
              }
              if (!p.anvisa && !fieldsToSet.anvisa_code && bestMatch.anvisa && bestScore >= 0.65) {
                fieldsToSet.anvisa_code = bestMatch.anvisa;
                fieldsToSet.anvisa_source = 'auto_infer';
                reasons.push(`ANVISA copiado de produto do mesmo fornecedor (${(bestScore * 100).toFixed(0)}%)`);
              }
            }
          }
        }
      }

      // ── Strategy 3: NCM → tipo heuristic ──
      if (!p.productType && !fieldsToSet.product_type && p.ncm && p.ncm.length >= 4) {
        const prefix = p.ncm.slice(0, 4);
        const mapping = NCM_TYPE_MAP[prefix];
        if (mapping) {
          fieldsToSet.product_type = mapping.tipo;
          if (mapping.subtipo && !p.productSubtype && !fieldsToSet.product_subtype) {
            fieldsToSet.product_subtype = mapping.subtipo;
          }
          reasons.push(`tipo inferido pelo NCM ${prefix}`);
        } else {
          // Try voting: what type do most products with same NCM prefix have?
          const ncmGroup = byNcmPrefix.get(prefix) || [];
          const typeCounts = new Map<string, number>();
          for (const g of ncmGroup) {
            if (g.productType) typeCounts.set(g.productType, (typeCounts.get(g.productType) || 0) + 1);
          }
          if (typeCounts.size > 0) {
            let maxType = '';
            let maxCount = 0;
            typeCounts.forEach((c, t) => {
              if (c > maxCount) { maxType = t; maxCount = c; }
            });
            // Require at least 2 votes and majority
            const totalWithType = ncmGroup.filter((g) => g.productType).length;
            if (maxCount >= 2 && maxCount / totalWithType >= 0.6) {
              fieldsToSet.product_type = maxType;
              reasons.push(`tipo inferido por votação NCM ${prefix} (${maxCount}/${totalWithType} produtos)`);
            }
          }
        }
      }

      // ── Strategy 4: Description keywords → tipo ──
      if (!p.productType && !fieldsToSet.product_type) {
        for (const hint of DESC_TYPE_HINTS) {
          if (hint.patterns.test(p.description)) {
            fieldsToSet.product_type = hint.tipo;
            if (hint.subtipo && !p.productSubtype && !fieldsToSet.product_subtype) {
              fieldsToSet.product_subtype = hint.subtipo;
            }
            reasons.push(`tipo inferido por palavra-chave na descrição`);
            break;
          }
        }
      }

      // ── Strategy 5: Same code prefix → copy ANVISA ──
      if (!p.anvisa && !fieldsToSet.anvisa_code && p.code) {
        // Extract code prefix (digits before last 1-2 chars that vary)
        const codeNorm = norm(p.code);
        if (codeNorm.length >= 4) {
          const prefix = codeNorm.slice(0, Math.max(4, codeNorm.length - 2));
          for (const other of products) {
            if (other.key === p.key || !other.anvisa || !other.code) continue;
            const otherNorm = norm(other.code);
            if (otherNorm.startsWith(prefix) && otherNorm.length === codeNorm.length) {
              // Same code structure, same prefix — likely same product family
              // Additional check: descriptions must share at least 50% tokens
              const pTok = descTokensMap.get(p.key) || [];
              const oTok = descTokensMap.get(other.key) || [];
              if (dice(pTok, oTok) >= 0.5) {
                fieldsToSet.anvisa_code = other.anvisa;
                fieldsToSet.anvisa_source = 'auto_infer';
                reasons.push(`ANVISA copiado de produto com código similar (${other.code})`);
                break;
              }
            }
          }
        }
      }

      // ── Strategy 6: Infer manufacturer from similar products / same supplier ──
      if (!p.anvisaManufacturer && !fieldsToSet.anvisa_manufacturer) {
        // 6a: Same supplier + similar description → copy manufacturer
        if (p.supplierCnpj) {
          const supplierProducts = bySupplier.get(p.supplierCnpj) || [];
          const pTokens = descTokensMap.get(p.key) || [];
          if (pTokens.length >= 2) {
            for (const other of supplierProducts) {
              if (other.key === p.key || !other.anvisaManufacturer) continue;
              const oTokens = descTokensMap.get(other.key) || [];
              let score = dice(pTokens, oTokens);
              if (p.ncm && other.ncm && p.ncm === other.ncm) score = Math.min(score + 0.1, 0.99);
              if (score >= 0.40) {
                fieldsToSet.anvisa_manufacturer = other.anvisaManufacturer;
                if (!p.anvisaHolder && !fieldsToSet.anvisa_holder && other.anvisaHolder) {
                  fieldsToSet.anvisa_holder = other.anvisaHolder;
                }
                reasons.push(`fabricante copiado de produto do mesmo fornecedor (${(score * 100).toFixed(0)}%)`);
                break;
              }
            }
          }
        }

        // 6b: Same NCM prefix → majority vote on manufacturer
        if (!fieldsToSet.anvisa_manufacturer && p.ncm && p.ncm.length >= 4) {
          const prefix = p.ncm.slice(0, 4);
          const ncmGroup = byNcmPrefix.get(prefix) || [];
          const mfgCounts = new Map<string, number>();
          for (const g of ncmGroup) {
            if (g.anvisaManufacturer) mfgCounts.set(g.anvisaManufacturer, (mfgCounts.get(g.anvisaManufacturer) || 0) + 1);
          }
          // Only use if one manufacturer dominates (≥70%) with at least 3 votes
          if (mfgCounts.size > 0) {
            let maxMfg = '';
            let maxCount = 0;
            mfgCounts.forEach((c, m) => { if (c > maxCount) { maxMfg = m; maxCount = c; } });
            const totalWithMfg = ncmGroup.filter((g) => g.anvisaManufacturer).length;
            if (maxCount >= 3 && maxCount / totalWithMfg >= 0.7) {
              fieldsToSet.anvisa_manufacturer = maxMfg;
              reasons.push(`fabricante inferido por votação NCM ${prefix} (${maxCount}/${totalWithMfg})`);
            }
          }
        }

        // 6c: Description similarity (broader search) → copy manufacturer
        if (!fieldsToSet.anvisa_manufacturer) {
          const pTokens = descTokensMap.get(p.key) || [];
          if (pTokens.length >= 2) {
            let bestMatch: Product | null = null;
            let bestScore = 0;
            for (const other of products) {
              if (other.key === p.key || !other.anvisaManufacturer) continue;
              const oTokens = descTokensMap.get(other.key) || [];
              if (oTokens.length < 2) continue;
              let score = dice(pTokens, oTokens);
              if (p.ncm && other.ncm && p.ncm === other.ncm) score = Math.min(score + 0.1, 0.99);
              if (score > bestScore) { bestScore = score; bestMatch = other; }
            }
            if (bestMatch && bestScore >= 0.60) {
              fieldsToSet.anvisa_manufacturer = bestMatch.anvisaManufacturer;
              if (!p.anvisaHolder && !fieldsToSet.anvisa_holder && bestMatch.anvisaHolder) {
                fieldsToSet.anvisa_holder = bestMatch.anvisaHolder;
              }
              reasons.push(`fabricante inferido por descrição similar (${(bestScore * 100).toFixed(0)}% "${bestMatch.description.slice(0, 30)}")`);
            }
          }
        }
      }

      if (Object.keys(fieldsToSet).length > 0) {
        updates.push({ key: p.key, id: pId, fields: fieldsToSet, reason: reasons.join('; ') });
      }
    }

    // ── Apply updates ──
    let applied = 0;
    if (!dryRun && updates.length > 0) {
      for (const u of updates) {
        const setClauses: string[] = ['updated_at = NOW()'];
        const params: unknown[] = [u.id];
        let pi = 2;

        for (const [col, val] of Object.entries(u.fields)) {
          setClauses.push(`${col} = $${pi++}`);
          params.push(val);
        }

        await prisma.$executeRawUnsafe(
          `UPDATE product_registry SET ${setClauses.join(', ')} WHERE id = $1`,
          ...params,
        );
        applied++;
      }
    }

    // ── Build summary ──
    const stats = {
      totalProducts: products.length,
      productsAnalyzed: products.length,
      updatesFound: updates.length,
      updatesApplied: dryRun ? 0 : applied,
      dryRun,
      byField: {
        anvisa: updates.filter((u) => u.fields.anvisa_code).length,
        productType: updates.filter((u) => u.fields.product_type).length,
        productSubtype: updates.filter((u) => u.fields.product_subtype).length,
        manufacturer: updates.filter((u) => u.fields.anvisa_manufacturer).length,
        holder: updates.filter((u) => u.fields.anvisa_holder).length,
      },
      preview: updates.slice(0, 50).map((u) => {
        const product = products.find((p) => p.key === u.key);
        return {
          code: product?.code,
          description: product?.description?.slice(0, 60),
          fields: u.fields,
          reason: u.reason,
        };
      }),
    };

    return NextResponse.json(stats);
  } catch (e) {
    console.error('auto-classify error', e);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
