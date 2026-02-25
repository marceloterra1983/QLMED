#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const APPLY = process.argv.includes('--apply');
const COMPANY_ARG_INDEX = process.argv.findIndex((arg) => arg === '--company');
const TARGET_COMPANY_ID = COMPANY_ARG_INDEX >= 0 ? process.argv[COMPANY_ARG_INDEX + 1] : null;

const SUBTYPE_FIXES = {
  INSTRUMENAL_BUCO: 'INSTRUMENTAL BUCO',
  BALAO_FARMACOLOGCO_FREEWAY: 'BALAO FARMACOLOGICO - FREEWAY',
  ACESSORIO: 'ACESSORIO',
  ACESSORIOS: 'ACESSORIOS',
};

const TYPE_DEFAULT_SUBTYPE = {
  ORTOPEDIA: 'OUTROS',
  HEMODINAMICA: 'HEMODINAMICA - OUTROS',
  CARDIACA: 'CARDIACA - OUTROS',
  EQUIPAMENTOS: 'EQUIPAMENTOS - OUTROS',
  OUTROS: 'OUTROS',
  'Dispositivos Médicos': 'INSTRUMENTO OU APARELHO MEDICO-CIRURGICO',
  'Materiais Hospitalares': 'GENERICO',
  'Gases Medicinais': 'GENERICO',
};

const KEYWORD_HINTS = [
  {
    regex: /\b(stent|cateter|fio guia|guia hid|introdu|bainha|angiograf|ptca|bal(a|ao)\b|coronar)/i,
    type: 'HEMODINAMICA',
    subtype: 'HEMODINAMICA - OUTROS',
  },
  {
    regex: /\b(valvula|anel|canula|cec|carbomedics|mitral|aortica|perceval|marcapasso)/i,
    type: 'CARDIACA',
    subtype: 'CARDIACA - OUTROS',
  },
  {
    regex: /\b(parafuso|placa|haste|joelho|cervical|ortoped|afastador|pinca|tesoura|osteo|buco|maxilo)/i,
    type: 'ORTOPEDIA',
    subtype: 'OUTROS',
  },
  {
    regex: /\b(monitor|gerador|bomba|equip|navegador|drill|aspirador|display)/i,
    type: 'EQUIPAMENTOS',
    subtype: 'EQUIPAMENTOS - OUTROS',
  },
  {
    regex: /\b(gas|oxigen|o2|co2|fluxometro|blender)/i,
    type: 'GASES MEDICINAIS',
    subtype: 'GENERICO',
  },
];

function normalizeCode(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();
}

function normalizeLabel(value) {
  return normalizeText(value).replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function normalizeSubtype(value) {
  const label = normalizeLabel(value);
  if (!label) return null;
  return SUBTYPE_FIXES[label] || normalizeText(value).replace(/\s+/g, ' ');
}

function normalizeType(value) {
  const text = normalizeText(value).replace(/\s+/g, ' ');
  if (!text) return null;
  if (text === 'DISPOSITIVOS MEDICOS') return 'Dispositivos Médicos';
  if (text === 'MATERIAIS HOSPITALARES') return 'Materiais Hospitalares';
  if (text === 'GASES MEDICINAIS') return 'Gases Medicinais';
  if (text === 'FORA DE LINHA - HEMOD.' || text === 'FORA DE LINHA - HEMOD') return 'FORA DE LINHA - HEMOD.';
  return text;
}

function normalizeAnvisa(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length === 11 ? digits : null;
}

function clean(value) {
  const s = String(value ?? '').trim();
  return s.length > 0 ? s : null;
}

function tokens(value) {
  return normalizeText(value)
    .split(/[\s/;,.\-()]+/)
    .filter((t) => t.length >= 3);
}

function dice(a, b) {
  if (!a.length || !b.length) return 0;
  const setB = new Set(b);
  let inter = 0;
  for (const t of a) if (setB.has(t)) inter += 1;
  return (2 * inter) / (a.length + b.length);
}

function countValues(values) {
  const map = new Map();
  for (const value of values) {
    if (!value) continue;
    map.set(value, (map.get(value) || 0) + 1);
  }
  return map;
}

function majority(values) {
  const counts = countValues(values);
  if (!counts.size) {
    return {
      value: null,
      count: 0,
      total: 0,
      ratio: 0,
      unique: 0,
      counts,
    };
  }

  let bestValue = null;
  let bestCount = 0;
  let total = 0;
  for (const [value, count] of counts.entries()) {
    total += count;
    if (count > bestCount) {
      bestValue = value;
      bestCount = count;
    }
  }

  return {
    value: bestValue,
    count: bestCount,
    total,
    ratio: total > 0 ? bestCount / total : 0,
    unique: counts.size,
    counts,
  };
}

function nowStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function loadMapping(csvPath) {
  const content = fs.readFileSync(csvPath, 'utf8').replace(/^\uFEFF/, '');
  const lines = content.split(/\r?\n/).filter(Boolean);
  if (!lines.length) return { byCode: new Map(), byAnvisa: new Map() };

  lines.shift();
  const byCode = new Map();
  const byAnvisa = new Map();

  for (const line of lines) {
    const cols = line.split(';');
    const code = clean(cols[0]);
    const description = clean(cols[1]);
    const manufacturer = clean(cols[2]);
    const category = clean(cols[3]);
    const subtype = clean(cols[4]);
    const anvisa = normalizeAnvisa(cols[5]);

    const record = {
      code,
      description,
      manufacturer: manufacturer ? normalizeText(manufacturer) : null,
      category: category ? normalizeType(category) : null,
      subtype: subtype ? normalizeSubtype(subtype) : null,
      anvisa,
    };

    const codeKey = normalizeCode(code);
    if (codeKey) {
      const current = byCode.get(codeKey) || [];
      current.push(record);
      byCode.set(codeKey, current);
    }

    if (anvisa) {
      const current = byAnvisa.get(anvisa) || [];
      current.push(record);
      byAnvisa.set(anvisa, current);
    }
  }

  return { byCode, byAnvisa };
}

function groupBy(rows, keyFn) {
  const map = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    if (!key) continue;
    const current = map.get(key) || [];
    current.push(row);
    map.set(key, current);
  }
  return map;
}

function addReason(reasonMap, reason) {
  reasonMap.set(reason, (reasonMap.get(reason) || 0) + 1);
}

function addField(fieldMap, field) {
  fieldMap.set(field, (fieldMap.get(field) || 0) + 1);
}

function buildUpdate(row, field, value, reason, bucket) {
  if (!bucket.fields[field]) {
    bucket.fields[field] = value;
    bucket.reasons.push(reason);
    addField(bucket.fieldCounts, field);
    addReason(bucket.reasonCounts, reason);
  }
}

async function main() {
  const prisma = new PrismaClient();

  try {
    const csvPath = path.join(__dirname, '..', 'anvisa-mapping-mais_anvisa3.csv');
    const mapping = loadMapping(csvPath);

    const rows = await prisma.$queryRawUnsafe(`
      SELECT
        id,
        company_id,
        code,
        description,
        ncm,
        unit,
        ean,
        anvisa_code,
        anvisa_source,
        product_type,
        product_subtype,
        anvisa_holder,
        anvisa_manufacturer,
        updated_at
      FROM product_registry
    `);

    const companies = new Map();
    for (const row of rows) {
      if (TARGET_COMPANY_ID && row.company_id !== TARGET_COMPANY_ID) continue;
      const current = companies.get(row.company_id) || [];
      current.push({
        id: String(row.id),
        companyId: String(row.company_id),
        code: clean(row.code),
        description: clean(row.description) || '',
        ncm: clean(row.ncm),
        unit: clean(row.unit),
        ean: clean(row.ean),
        anvisaCode: normalizeAnvisa(row.anvisa_code),
        anvisaSource: clean(row.anvisa_source),
        productType: normalizeType(row.product_type),
        productSubtype: normalizeSubtype(row.product_subtype),
        anvisaHolder: clean(row.anvisa_holder),
        anvisaManufacturer: row.anvisa_manufacturer ? normalizeText(row.anvisa_manufacturer) : null,
      });
      companies.set(row.company_id, current);
    }

    const report = {
      generatedAt: new Date().toISOString(),
      mode: APPLY ? 'apply' : 'dry-run',
      companyCount: companies.size,
      totalsBefore: {
        products: 0,
        missingAnvisa: 0,
        missingType: 0,
        missingSubtype: 0,
        missingManufacturer: 0,
      },
      applied: {
        updatesFound: 0,
        updatesApplied: 0,
        byField: {},
        byReason: {},
      },
      inconsistencies: {
        codeWithMultipleAnvisa: [],
        anvisaWithMultipleTypes: [],
      },
      suggestions: {
        possibleNewTypes: [],
        possibleNewSubtypes: [],
      },
      preview: [],
    };

    const globalFieldCounts = new Map();
    const globalReasonCounts = new Map();
    const updates = [];

    for (const [companyId, companyRows] of companies.entries()) {
      report.totalsBefore.products += companyRows.length;
      report.totalsBefore.missingAnvisa += companyRows.filter((r) => !r.anvisaCode).length;
      report.totalsBefore.missingType += companyRows.filter((r) => !r.productType).length;
      report.totalsBefore.missingSubtype += companyRows.filter((r) => !r.productSubtype).length;
      report.totalsBefore.missingManufacturer += companyRows.filter((r) => !r.anvisaManufacturer).length;

      const byAnvisa = groupBy(companyRows.filter((r) => r.anvisaCode), (r) => r.anvisaCode);
      const byCode = groupBy(companyRows.filter((r) => r.code), (r) => normalizeCode(r.code));
      const byDescNcm = groupBy(
        companyRows,
        (r) => `${normalizeText(r.description)}::${(r.ncm || '').slice(0, 8)}`,
      );
      const bySubtype = groupBy(companyRows.filter((r) => r.productSubtype), (r) => r.productSubtype);
      const byNcmType = groupBy(
        companyRows.filter((r) => r.productType && r.ncm),
        (r) => `${r.productType}::${String(r.ncm).slice(0, 4)}`,
      );

      const tokenMap = new Map(companyRows.map((r) => [r.id, tokens(r.description)]));

      for (const row of companyRows) {
        const bucket = {
          fields: {},
          reasons: [],
          fieldCounts: new Map(),
          reasonCounts: new Map(),
        };

        const codeKey = normalizeCode(row.code);
        const descKey = `${normalizeText(row.description)}::${(row.ncm || '').slice(0, 8)}`;
        const siblingsByCode = codeKey ? (byCode.get(codeKey) || []).filter((r) => r.id !== row.id) : [];
        const siblingsByAnvisa = row.anvisaCode ? (byAnvisa.get(row.anvisaCode) || []).filter((r) => r.id !== row.id) : [];
        const siblingsByDesc = (byDescNcm.get(descKey) || []).filter((r) => r.id !== row.id);

        if (!row.anvisaCode) {
          const codeAnvisa = majority(siblingsByCode.map((r) => r.anvisaCode));
          if (codeAnvisa.value && codeAnvisa.unique === 1 && codeAnvisa.count >= 1) {
            buildUpdate(row, 'anvisa_code', codeAnvisa.value, 'anvisa_by_code_majority', bucket);
            buildUpdate(row, 'anvisa_source', 'auto_infer', 'anvisa_by_code_majority_source', bucket);
          }

          if (!bucket.fields.anvisa_code && siblingsByDesc.length) {
            const descAnvisa = majority(siblingsByDesc.map((r) => r.anvisaCode));
            if (descAnvisa.value && descAnvisa.unique === 1 && descAnvisa.count >= 1) {
              buildUpdate(row, 'anvisa_code', descAnvisa.value, 'anvisa_by_desc_ncm', bucket);
              buildUpdate(row, 'anvisa_source', 'auto_infer', 'anvisa_by_desc_ncm_source', bucket);
            }
          }

          if (!bucket.fields.anvisa_code && codeKey) {
            const mappingEntries = mapping.byCode.get(codeKey) || [];
            const mappingAnvisa = majority(mappingEntries.map((m) => m.anvisa));
            if (mappingAnvisa.value && mappingAnvisa.unique === 1 && mappingAnvisa.count >= 1) {
              buildUpdate(row, 'anvisa_code', mappingAnvisa.value, 'anvisa_by_mapping_code', bucket);
              buildUpdate(row, 'anvisa_source', 'manual', 'anvisa_by_mapping_code_source', bucket);
            }
          }

          if (!bucket.fields.anvisa_code) {
            const rowTokens = tokenMap.get(row.id) || [];
            if (rowTokens.length >= 3) {
              let best = null;
              let bestScore = 0;
              for (const candidate of companyRows) {
                if (candidate.id === row.id || !candidate.anvisaCode) continue;
                if (row.ncm && candidate.ncm && String(row.ncm).slice(0, 4) !== String(candidate.ncm).slice(0, 4)) {
                  continue;
                }
                const candidateTokens = tokenMap.get(candidate.id) || [];
                if (candidateTokens.length < 3) continue;
                let score = dice(rowTokens, candidateTokens);
                if (row.unit && candidate.unit && normalizeText(row.unit) === normalizeText(candidate.unit)) score += 0.05;
                if (score > bestScore) {
                  bestScore = score;
                  best = candidate;
                }
              }
              if (best && bestScore >= 0.85) {
                buildUpdate(row, 'anvisa_code', best.anvisaCode, 'anvisa_by_similarity', bucket);
                buildUpdate(row, 'anvisa_source', 'auto_infer', 'anvisa_by_similarity_source', bucket);
              }
            }
          }
        }

        const resolvedAnvisa = bucket.fields.anvisa_code || row.anvisaCode;

        if (!row.anvisaManufacturer) {
          if (resolvedAnvisa) {
            const mfgByAnvisa = majority((byAnvisa.get(resolvedAnvisa) || []).map((r) => r.anvisaManufacturer));
            if (mfgByAnvisa.value && mfgByAnvisa.count >= 1 && (mfgByAnvisa.unique === 1 || mfgByAnvisa.ratio >= 0.75)) {
              buildUpdate(row, 'anvisa_manufacturer', mfgByAnvisa.value, 'manufacturer_by_anvisa', bucket);
            }
          }

          if (!bucket.fields.anvisa_manufacturer && siblingsByCode.length) {
            const mfgByCode = majority(siblingsByCode.map((r) => r.anvisaManufacturer));
            if (mfgByCode.value && mfgByCode.count >= 2 && mfgByCode.ratio >= 0.7) {
              buildUpdate(row, 'anvisa_manufacturer', mfgByCode.value, 'manufacturer_by_code', bucket);
            }
          }

          if (!bucket.fields.anvisa_manufacturer && codeKey) {
            const mappingEntries = mapping.byCode.get(codeKey) || [];
            const mappingMfg = majority(mappingEntries.map((m) => m.manufacturer));
            const mappingAnvisa = majority(mappingEntries.map((m) => m.anvisa));
            const anvisaCompatible =
              !resolvedAnvisa ||
              !mappingAnvisa.value ||
              mappingAnvisa.value === resolvedAnvisa;
            const mappingConsistent =
              mappingAnvisa.unique <= 1 || (mappingAnvisa.count >= 2 && mappingAnvisa.ratio >= 0.8);
            if (mappingMfg.value && mappingMfg.unique === 1 && anvisaCompatible && mappingConsistent) {
              buildUpdate(row, 'anvisa_manufacturer', mappingMfg.value, 'manufacturer_by_mapping_code', bucket);
            }
          }
        }

        if (!row.productType || !row.productSubtype) {
          const siblingsByResolvedAnvisa = resolvedAnvisa ? (byAnvisa.get(resolvedAnvisa) || []).filter((r) => r.id !== row.id) : [];

          if (!row.productType && siblingsByResolvedAnvisa.length) {
            const typeByAnvisa = majority(siblingsByResolvedAnvisa.map((r) => r.productType));
            if (typeByAnvisa.value && typeByAnvisa.count >= 2 && typeByAnvisa.ratio >= 0.6) {
              buildUpdate(row, 'product_type', typeByAnvisa.value, 'type_by_anvisa', bucket);
            }
          }

          if (!row.productSubtype && siblingsByResolvedAnvisa.length) {
            const subtypeByAnvisa = majority(siblingsByResolvedAnvisa.map((r) => r.productSubtype));
            if (subtypeByAnvisa.value && subtypeByAnvisa.count >= 2 && subtypeByAnvisa.ratio >= 0.55) {
              buildUpdate(row, 'product_subtype', subtypeByAnvisa.value, 'subtype_by_anvisa', bucket);
            }
          }

          if (!row.productType && siblingsByCode.length) {
            const typeByCode = majority(siblingsByCode.map((r) => r.productType));
            if (typeByCode.value && typeByCode.count >= 2 && typeByCode.ratio >= 0.6) {
              buildUpdate(row, 'product_type', typeByCode.value, 'type_by_code', bucket);
            }
          }

          if (!row.productSubtype && siblingsByCode.length) {
            const subtypeByCode = majority(siblingsByCode.map((r) => r.productSubtype));
            if (subtypeByCode.value && subtypeByCode.count >= 2 && subtypeByCode.ratio >= 0.55) {
              buildUpdate(row, 'product_subtype', subtypeByCode.value, 'subtype_by_code', bucket);
            }
          }

          if (!row.productType && row.productSubtype) {
            const subtypeType = majority((bySubtype.get(row.productSubtype) || []).map((r) => r.productType));
            if (subtypeType.value && subtypeType.count >= 3 && subtypeType.ratio >= 0.7) {
              buildUpdate(row, 'product_type', subtypeType.value, 'type_by_subtype', bucket);
            }
          }

          if (!row.productSubtype && (row.productType || bucket.fields.product_type) && row.ncm) {
            const resolvedType = bucket.fields.product_type || row.productType;
            const ncmKey = `${resolvedType}::${String(row.ncm).slice(0, 4)}`;
            const subtypeByNcm = majority((byNcmType.get(ncmKey) || []).map((r) => r.productSubtype));
            if (subtypeByNcm.value && subtypeByNcm.count >= 2 && subtypeByNcm.ratio >= 0.65) {
              buildUpdate(row, 'product_subtype', subtypeByNcm.value, 'subtype_by_type_ncm', bucket);
            }
          }

          if (!row.productType || !row.productSubtype) {
            const normalizedDesc = normalizeText(row.description);
            for (const hint of KEYWORD_HINTS) {
              if (!hint.regex.test(normalizedDesc)) continue;
              if (!row.productType && !bucket.fields.product_type) {
                buildUpdate(row, 'product_type', normalizeType(hint.type), 'type_by_keyword', bucket);
              }
              if (!row.productSubtype && !bucket.fields.product_subtype && hint.subtype) {
                buildUpdate(row, 'product_subtype', normalizeSubtype(hint.subtype), 'subtype_by_keyword', bucket);
              }
              break;
            }
          }

          if (!row.productSubtype && !bucket.fields.product_subtype) {
            const resolvedType = bucket.fields.product_type || row.productType;
            if (resolvedType) {
              const defaultSubtype = TYPE_DEFAULT_SUBTYPE[resolvedType];
              if (defaultSubtype) {
                buildUpdate(row, 'product_subtype', normalizeSubtype(defaultSubtype), 'subtype_default_by_type', bucket);
              }
            }
          }
        }

        if (row.productSubtype) {
          const fixedSubtype = normalizeSubtype(row.productSubtype);
          if (fixedSubtype && fixedSubtype !== row.productSubtype) {
            buildUpdate(row, 'product_subtype', fixedSubtype, 'subtype_spelling_fix', bucket);
          }
        }

        if (Object.keys(bucket.fields).length > 0) {
          updates.push({ id: row.id, companyId, fields: bucket.fields, reasons: bucket.reasons, code: row.code, description: row.description });
          for (const [field, count] of bucket.fieldCounts.entries()) {
            globalFieldCounts.set(field, (globalFieldCounts.get(field) || 0) + count);
          }
          for (const [reason, count] of bucket.reasonCounts.entries()) {
            globalReasonCounts.set(reason, (globalReasonCounts.get(reason) || 0) + count);
          }
        }
      }

      for (const [code, list] of byCode.entries()) {
        const anvisaMaj = majority(list.map((r) => r.anvisaCode));
        if (anvisaMaj.unique > 1 && anvisaMaj.total >= 2) {
          report.inconsistencies.codeWithMultipleAnvisa.push({
            companyId,
            code,
            distinctAnvisa: anvisaMaj.unique,
            total: anvisaMaj.total,
            topAnvisa: anvisaMaj.value,
            topRatio: Number(anvisaMaj.ratio.toFixed(3)),
          });
        }
      }

      for (const [anvisa, list] of byAnvisa.entries()) {
        const typeMaj = majority(list.map((r) => r.productType));
        if (typeMaj.unique > 1 && typeMaj.total >= 2) {
          report.inconsistencies.anvisaWithMultipleTypes.push({
            companyId,
            anvisa,
            distinctTypes: typeMaj.unique,
            total: typeMaj.total,
            topType: typeMaj.value,
            topRatio: Number(typeMaj.ratio.toFixed(3)),
          });
        }
      }
    }

    report.applied.updatesFound = updates.length;

    if (APPLY && updates.length > 0) {
      for (const update of updates) {
        const columns = Object.keys(update.fields);
        const params = [update.id];
        const setClauses = ['updated_at = NOW()'];
        let idx = 2;

        for (const column of columns) {
          params.push(update.fields[column]);
          setClauses.push(`${column} = $${idx++}`);
        }

        await prisma.$executeRawUnsafe(
          `UPDATE product_registry SET ${setClauses.join(', ')} WHERE id = $1`,
          ...params,
        );

        report.applied.updatesApplied += 1;
      }
    }

    const fieldSummary = {};
    for (const [field, count] of globalFieldCounts.entries()) fieldSummary[field] = count;
    const reasonSummary = {};
    for (const [reason, count] of globalReasonCounts.entries()) reasonSummary[reason] = count;
    report.applied.byField = fieldSummary;
    report.applied.byReason = reasonSummary;

    report.preview = updates.slice(0, 120).map((u) => ({
      code: u.code,
      description: u.description.slice(0, 90),
      fields: u.fields,
      reasons: u.reasons,
    }));

    report.inconsistencies.codeWithMultipleAnvisa = report.inconsistencies.codeWithMultipleAnvisa
      .sort((a, b) => b.distinctAnvisa - a.distinctAnvisa || b.total - a.total)
      .slice(0, 120);

    report.inconsistencies.anvisaWithMultipleTypes = report.inconsistencies.anvisaWithMultipleTypes
      .sort((a, b) => b.distinctTypes - a.distinctTypes || b.total - a.total)
      .slice(0, 120);

    const unresolved = await prisma.$queryRawUnsafe(`
      SELECT
        COUNT(*)::int AS products,
        COUNT(*) FILTER (WHERE COALESCE(anvisa_code,'')='')::int AS missing_anvisa,
        COUNT(*) FILTER (WHERE COALESCE(product_type,'')='')::int AS missing_type,
        COUNT(*) FILTER (WHERE COALESCE(product_subtype,'')='')::int AS missing_subtype,
        COUNT(*) FILTER (WHERE COALESCE(anvisa_manufacturer,'')='')::int AS missing_manufacturer
      FROM product_registry
      ${TARGET_COMPANY_ID ? "WHERE company_id = $1" : ''}
    `, ...(TARGET_COMPANY_ID ? [TARGET_COMPANY_ID] : []));

    report.totalsAfter = unresolved[0];

    const unknownTypeCandidates = await prisma.$queryRawUnsafe(`
      SELECT
        product_subtype,
        COUNT(*)::int AS total,
        COUNT(DISTINCT product_type)::int AS distinct_types
      FROM product_registry
      WHERE COALESCE(product_subtype,'')<>''
      ${TARGET_COMPANY_ID ? "AND company_id = $1" : ''}
      GROUP BY product_subtype
      HAVING COUNT(*) >= 8 AND COUNT(DISTINCT product_type) = 1
      ORDER BY total DESC
      LIMIT 80
    `, ...(TARGET_COMPANY_ID ? [TARGET_COMPANY_ID] : []));

    report.suggestions.possibleNewSubtypes = unknownTypeCandidates;

    const testLike = await prisma.$queryRawUnsafe(`
      SELECT code, description, product_type, product_subtype
      FROM product_registry
      WHERE UPPER(COALESCE(product_type, '')) IN ('TESTE', 'TEST')
      ${TARGET_COMPANY_ID ? "AND company_id = $1" : ''}
      LIMIT 30
    `, ...(TARGET_COMPANY_ID ? [TARGET_COMPANY_ID] : []));

    report.suggestions.possibleNewTypes = testLike;

    const reportsDir = path.join(__dirname, '..', 'reports');
    fs.mkdirSync(reportsDir, { recursive: true });
    const reportPath = path.join(reportsDir, `product-inference-${nowStamp()}-${APPLY ? 'apply' : 'dryrun'}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    console.log(JSON.stringify({
      ok: true,
      mode: report.mode,
      reportPath,
      totalsBefore: report.totalsBefore,
      totalsAfter: report.totalsAfter,
      applied: report.applied,
      inconsistencyCounts: {
        codeWithMultipleAnvisa: report.inconsistencies.codeWithMultipleAnvisa.length,
        anvisaWithMultipleTypes: report.inconsistencies.anvisaWithMultipleTypes.length,
      },
    }, null, 2));
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
