import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import crypto from 'crypto';

const { Client } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseBrNumber(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  const normalized = s.replace(/\./g, '').replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function parseBrPercent(raw) {
  const n = parseBrNumber(raw);
  if (n == null || n < 0 || n > 100) return null;
  return n;
}

const SPICA_TIPO_MAP = {
  CARDIACA: 'CARDIACA',
  HEMODINAMICA: 'HEMODINAMICA',
  ORTOPEDIA: 'ORTOPEDIA',
  OUTROS: 'OUTROS',
  EQUIPAMENTOS: 'EQUIPAMENTOS',
  'FORA DE LINHA - HEMOD.': 'HEMODINAMICA',
  'FORA DE LINHA - CARDIACA': 'CARDIACA',
  'FORA DE LINHA - CRM': 'CRM',
};

function parseTipoSpica(tipoRaw) {
  const raw = String(tipoRaw ?? '').trim();
  const stripped = raw.replace(/^\d+\s*[-–]\s*/, '').trim();
  const outOfLine = /FORA\s+DE\s+LINHA/i.test(raw);
  if (!/^\d+\s*[-–]\s*/.test(raw) && raw !== '') {
    return { productType: null, outOfLine, invalid: true, tipoStripped: stripped };
  }
  if (!stripped) {
    return { productType: null, outOfLine, invalid: false, tipoStripped: '' };
  }
  const mapped = SPICA_TIPO_MAP[stripped] ?? SPICA_TIPO_MAP[stripped.toUpperCase()];
  if (mapped) {
    return { productType: mapped, outOfLine, invalid: false, tipoStripped: stripped };
  }
  if (outOfLine) {
    const rest = stripped.replace(/^FORA\s+DE\s+LINHA\s*[-–]?\s*/i, '').trim();
    const restMap = {
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

function splitSitTributaria(raw) {
  const digits = String(raw ?? '').replace(/\D/g, '');
  if (digits.length < 3) {
    return { sitTributaria: digits || null, origem: null, cstIcms: null };
  }
  const sit = digits.slice(0, 3);
  return { sitTributaria: sit, origem: sit[0], cstIcms: sit.slice(1) };
}

function normalizeAnvisaRvs(raw) {
  const digits = String(raw ?? '').replace(/\D/g, '');
  return digits.length === 11 ? digits : null;
}

function normalizeNcm(raw) {
  const digits = String(raw ?? '').replace(/\D/g, '');
  return digits.length === 8 ? digits : null;
}

function normalizeToken(s) {
  return (s ?? '').trim().toUpperCase();
}

function buildCanonicalProductKey(ref, codigo, isRefUnique) {
  const normRef = normalizeToken(ref);
  if (normRef && normRef !== '_' && normRef !== '-' && isRefUnique) {
    return `CODE:${normRef}::UNIT:UN`;
  }
  return `SPICA:${codigo}`;
}

async function main() {
  const isApply = process.argv.includes('--apply');
  const dryRun = !isApply;

  console.log('====================================================');
  console.log(`IMPORTADOR SPICA -> PORTAL QLMED (DIRETO NO BANCO)`);
  console.log(`Modo: ${dryRun ? 'DRY-RUN (Simulação)' : 'APPLY (GRAVAÇÃO REAL NO BANCO)'}`);
  console.log('====================================================\n');

  // Conexão direta com postgres local
  const client = new Client({
    connectionString: process.env.DATABASE_URL.replace('qlmed-db', '127.0.0.1'),
  });
  await client.connect();

  const companyRes = await client.query('SELECT id, cnpj, "razaoSocial" FROM "Company" WHERE cnpj = $1', ['07832309000197']);
  if (companyRes.rows.length === 0) {
    throw new Error('Empresa QLMED não encontrada');
  }
  const company = companyRes.rows[0];
  console.log(`Empresa: ${company.razaoSocial} (${company.id})`);

  // Lê CSV do Spica
  const csvPath = path.resolve(__dirname, '../tmp/spica-import/rel_produtos.csv');
  const lines = fs.readFileSync(csvPath, 'utf-8').split('\n');
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = [];
    let cur = '';
    let inQuotes = false;
    for (let c of line) {
      if (c === '"') inQuotes = !inQuotes;
      else if (c === ',' && !inQuotes) { values.push(cur); cur = ''; }
      else cur += c;
    }
    values.push(cur);
    if (values.length >= 10) {
      rows.push({
        codigo: values[0] ?? '',
        referencia: values[1] ?? '',
        nome: values[2] ?? '',
        tipo: values[3] ?? '',
        subtipo: values[4] ?? '',
        fabricante: values[5] ?? '',
        fornecedor: values[6] ?? '',
        instrumental: values[7] ?? '',
        rvs: values[8] ?? '',
        ncm: values[9] ?? '',
        sitTributaria: values[10] ?? '',
        nomeTributacao: values[11] ?? '',
        icms: values[12] ?? '',
        pis: values[13] ?? '',
        cofins: values[14] ?? '',
        ipiEntrada: values[15] ?? '',
        ipiSaida: values[16] ?? '',
        obsFiscal: values[17] ?? '',
      });
    }
  }
  console.log(`Lidos ${rows.length} produtos do Spica.`);

  // Conta frequências de referência
  const refFreq = new Map();
  for (const r of rows) {
    const ref = normalizeToken(r.referencia);
    if (ref) refFreq.set(ref, (refFreq.get(ref) || 0) + 1);
  }

  // Carrega produtos existentes do banco
  const dbRes = await client.query(`
    SELECT id, product_key, code, codigo, description, anvisa_code, product_refs
    FROM product_registry
    WHERE company_id = $1
  `, [company.id]);

  const existingByKey = new Map();
  const existingByCodeUpper = new Map();
  for (const r of dbRes.rows) {
    existingByKey.set(r.product_key, r);
    if (r.code) existingByCodeUpper.set(r.code.trim().toUpperCase(), r);
  }

  let updatedCount = 0;
  let insertCount = 0;
  const toUpdate = [];
  const toInsert = [];

  const now = new Date().toISOString();

  for (const r of rows) {
    const codigo = String(r.codigo).padStart(6, '0');
    const ref = String(r.referencia ?? '').trim();
    const isRefUnique = refFreq.get(normalizeToken(ref)) === 1;
    const pKey = buildCanonicalProductKey(ref, codigo, isRefUnique);

    const tipo = parseTipoSpica(r.tipo);
    const sit = splitSitTributaria(r.sitTributaria);
    const anvisa = normalizeAnvisaRvs(r.rvs);
    const ncm = normalizeNcm(r.ncm);
    const icms = parseBrPercent(r.icms);
    const pis = parseBrPercent(r.pis);
    const cofins = parseBrPercent(r.cofins);
    const ipi = parseBrPercent(r.ipiEntrada);
    const instrumental = String(r.instrumental).trim().toLowerCase() === 'sim';
    const fab = String(r.fabricante ?? '').trim() || null;
    const forn = String(r.fornecedor ?? '').trim() || null;
    const nome = String(r.nome ?? '').trim();
    const nomeTrib = String(r.nomeTributacao ?? '').trim() || null;
    const obs = String(r.obsFiscal ?? '').trim() || null;

    // Busca produto existente
    let match = existingByKey.get(pKey);
    if (!match && isRefUnique && ref) {
      match = existingByCodeUpper.get(ref.toUpperCase());
    }

    if (match) {
      // Atualização
      const existingRefs = match.product_refs || [];
      const mergedRefs = Array.from(new Set([...existingRefs, ref].filter(Boolean)));
      
      toUpdate.push({
        id: match.id,
        codigo,
        description: nome,
        productRefs: mergedRefs,
        // Tipo Spica → Linha; SubTipo → Grupo; origem sem 3º nível → Subgrupo null
        productType: tipo.invalid ? null : tipo.productType,
        productSubtype: tipo.invalid ? null : (r.subtipo?.trim() || null),
        productSubgroup: null,
        outOfLine: tipo.outOfLine,
        instrumental,
        manufacturerShortName: fab,
        defaultSupplier: forn,
        fiscalSitTributaria: sit.sitTributaria,
        fiscalOrigem: sit.origem,
        fiscalNomeTributacao: nomeTrib,
        fiscalIcms: icms,
        fiscalPis: pis,
        fiscalCofins: cofins,
        fiscalIpi: ipi,
        fiscalObs: obs,
        anvisaCode: match.anvisa_code || anvisa,
        anvisaSource: match.anvisa_code ? undefined : (anvisa ? 'spica' : null),
      });
      updatedCount++;
    } else {
      // Inserção
      toInsert.push({
        id: crypto.randomUUID(),
        companyId: company.id,
        productKey: pKey,
        code: ref || codigo,
        description: nome,
        ncm,
        unit: 'UN',
        anvisaCode: anvisa,
        anvisaSource: anvisa ? 'spica' : null,
        codigo,
        productRefs: ref ? [ref] : [],
        productType: tipo.invalid ? null : tipo.productType,
        productSubtype: tipo.invalid ? null : (r.subtipo?.trim() || null),
        productSubgroup: null,
        outOfLine: tipo.outOfLine,
        instrumental,
        manufacturerShortName: fab,
        defaultSupplier: forn,
        fiscalSitTributaria: sit.sitTributaria,
        fiscalOrigem: sit.origem,
        fiscalNomeTributacao: nomeTrib,
        fiscalIcms: icms,
        fiscalPis: pis,
        fiscalCofins: cofins,
        fiscalIpi: ipi,
        fiscalObs: obs,
      });
      insertCount++;
    }
  }

  console.log(`\n--- RESUMO DE PROCESSAMENTO ---`);
  console.log(`Total Spica: ${rows.length}`);
  console.log(`Produtos existentes atualizados com dados Spica: ${updatedCount}`);
  console.log(`Produtos novos para cadastrar: ${insertCount}`);

  if (isApply) {
    console.log(`\nIniciando gravação no banco de dados...`);
    await client.query('BEGIN');

    try {
      // 1. Atualizar existentes
      console.log(`Atualizando ${toUpdate.length} produtos existentes...`);
      for (const u of toUpdate) {
                await client.query(`
          UPDATE product_registry SET
            codigo = $1,
            description = $2,
            product_refs = $3,
            product_type = $4,
            product_subtype = $5,
            product_subgroup = $6,
            out_of_line = $7,
            instrumental = $8,
            manufacturer_short_name = $9,
            default_supplier = $10,
            fiscal_sit_tributaria = $11,
            fiscal_origem = $12,
            fiscal_nome_tributacao = $13,
            fiscal_icms = $14,
            fiscal_pis = $15,
            fiscal_cofins = $16,
            fiscal_ipi = $17,
            fiscal_obs = $18,
            anvisa_code = COALESCE(anvisa_code, $19),
            anvisa_source = CASE WHEN anvisa_code IS NULL AND $19 IS NOT NULL THEN 'spica' ELSE anvisa_source END,
            updated_at = NOW()
          WHERE id = $20
        `, [
          u.codigo, u.description, u.productRefs, u.productType, u.productSubtype, u.productSubgroup, u.outOfLine, u.instrumental,
          u.manufacturerShortName, u.defaultSupplier, u.fiscalSitTributaria, u.fiscalOrigem,
          u.fiscalNomeTributacao, u.fiscalIcms, u.fiscalPis, u.fiscalCofins, u.fiscalIpi,
          u.fiscalObs, u.anvisaCode, u.id
        ]);
      }

      // 2. Inserir novos
      console.log(`Inserindo ${toInsert.length} produtos novos...`);
      const BATCH = 200;
      for (let i = 0; i < toInsert.length; i += BATCH) {
        const batch = toInsert.slice(i, i + BATCH);
        for (const item of batch) {
          await client.query(`
            INSERT INTO product_registry (
              id, company_id, product_key, code, description, ncm, unit,
              anvisa_code, anvisa_source, codigo, product_refs, product_type,
              product_subtype, product_subgroup, out_of_line, instrumental, manufacturer_short_name,
              default_supplier, fiscal_sit_tributaria, fiscal_origem, fiscal_nome_tributacao,
              fiscal_icms, fiscal_pis, fiscal_cofins, fiscal_ipi, fiscal_obs,
              created_at, updated_at
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, NOW(), NOW()
            )
          `, [
            item.id, item.companyId, item.productKey, item.code, item.description, item.ncm, item.unit,
            item.anvisaCode, item.anvisaSource, item.codigo, item.productRefs, item.productType,
            item.productSubtype, item.productSubgroup, item.outOfLine, item.instrumental, item.manufacturerShortName,
            item.defaultSupplier, item.fiscalSitTributaria, item.fiscalOrigem, item.fiscalNomeTributacao,
            item.fiscalIcms, item.fiscalPis, item.fiscalCofins, item.fiscalIpi, item.fiscalObs
          ]);
        }
      }

      await client.query('COMMIT');
      console.log(`\n>>> SUCESSO ABSOLUTO! GRAVAÇÃO CONCLUÍDA NO BANCO DE DADOS! <<<`);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Erro na gravação, transação abortada:', err);
      throw err;
    }
  } else {
    console.log(`\nSimulação concluída com sucesso. Nenhuma alteração foi gravada.`);
  }

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
