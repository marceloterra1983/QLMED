/**
 * Bulk Import XML files from a local folder into the database.
 * Usage: node scripts/bulk_import_xml.js [folder_path] [start_year]
 * Example: node scripts/bulk_import_xml.js "/mnt/c/Users/marce/OneDrive - QL MED/BACKUP_QL MED/NFE/XML" 2021
 *
 * This historical backfill intentionally does not send notifications. Require
 * an explicit acknowledgement so normal production operation cannot bypass
 * the transactional outbox silently.
 */

if (process.env.ALLOW_OUTBOX_BYPASS !== 'historical-import') {
  throw new Error('Set ALLOW_OUTBOX_BYPASS=historical-import to run this historical import without notifications.');
}

const { PrismaClient } = require('@prisma/client');
const { parseString } = require('xml2js');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

// Replicating the XML parser logic from src/lib/xml-parser.ts
function parseXmlPromise(xml) {
  return new Promise((resolve, reject) => {
    parseString(xml, { explicitArray: false, trim: true }, (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
  });
}

function getNestedValue(obj, ...paths) {
  for (const p of paths) {
    const keys = p.split('.');
    let value = obj;
    for (const key of keys) {
      value = value?.[key];
    }
    if (value !== undefined && value !== null) {
      return String(value);
    }
  }
  return '';
}

async function parseNFeXml(xmlContent) {
  const parsed = await parseXmlPromise(xmlContent);
  const nfeProc = parsed.nfeProc || parsed.NFe || parsed;
  const nfe = nfeProc.NFe || nfeProc;
  const infNFe = nfe.infNFe || nfe;
  const ide = infNFe.ide || {};
  const emit = infNFe.emit || {};
  const dest = infNFe.dest || {};
  const total = infNFe.total?.ICMSTot || infNFe.total || {};

  let accessKey = '';
  if (nfeProc.protNFe?.infProt?.chNFe) {
    accessKey = nfeProc.protNFe.infProt.chNFe;
  } else if (infNFe.$?.Id) {
    accessKey = infNFe.$.Id.replace('NFe', '');
  }

  return {
    accessKey: accessKey || `MANUAL_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,
    type: 'NFE',
    number: getNestedValue(ide, 'nNF', 'nCT') || '0',
    series: getNestedValue(ide, 'serie') || '1',
    issueDate: getNestedValue(ide, 'dhEmi', 'dEmi') || new Date().toISOString(),
    senderCnpj: getNestedValue(emit, 'CNPJ', 'CPF') || '',
    senderName: getNestedValue(emit, 'xNome') || 'Emitente não identificado',
    recipientCnpj: getNestedValue(dest, 'CNPJ', 'CPF') || '',
    recipientName: getNestedValue(dest, 'xNome') || 'Destinatário não identificado',
    totalValue: parseFloat(getNestedValue(total, 'vNF', 'vPrest.vTPrest') || '0'),
  };
}

async function parseCTeXml(xmlContent) {
  const parsed = await parseXmlPromise(xmlContent);
  const cteProc = parsed.cteProc || parsed.CTe || parsed;
  const cte = cteProc.CTe || cteProc;
  const infCte = cte.infCte || cte;
  const ide = infCte.ide || {};
  const emit = infCte.emit || {};
  const dest = infCte.dest || {};
  const vPrest = infCte.vPrest || {};

  let accessKey = '';
  if (cteProc.protCTe?.infProt?.chCTe) {
    accessKey = cteProc.protCTe.infProt.chCTe;
  } else if (infCte.$?.Id) {
    accessKey = infCte.$.Id.replace('CTe', '');
  }

  return {
    accessKey: accessKey || `MANUAL_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,
    type: 'CTE',
    number: getNestedValue(ide, 'nCT') || '0',
    series: getNestedValue(ide, 'serie') || '1',
    issueDate: getNestedValue(ide, 'dhEmi', 'dEmi') || new Date().toISOString(),
    senderCnpj: getNestedValue(emit, 'CNPJ') || '',
    senderName: getNestedValue(emit, 'xNome') || 'Emitente não identificado',
    recipientCnpj: getNestedValue(dest, 'CNPJ') || '',
    recipientName: getNestedValue(dest, 'xNome') || 'Destinatário não identificado',
    totalValue: parseFloat(getNestedValue(vPrest, 'vTPrest') || '0'),
  };
}

async function parseInvoiceXml(xmlContent) {
  if (xmlContent.includes('cteProc') || xmlContent.includes('<CTe')) {
    return parseCTeXml(xmlContent);
  }
  return parseNFeXml(xmlContent);
}

// Recursively find all XML files
function findXmlFiles(dir, startYear) {
  const results = [];
  
  function walk(currentDir) {
    let entries;
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch (err) {
      console.error(`  Cannot read directory: ${currentDir}`);
      return;
    }
    
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        // Filter by year - check if the directory name starts with a year >= startYear
        const yearMatch = entry.name.match(/^(\d{4})/);
        if (yearMatch && currentDir === dir) {
          const year = parseInt(yearMatch[1]);
          if (year < startYear) {
            continue; // Skip years before startYear
          }
        }
        walk(fullPath);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.xml')) {
        results.push(fullPath);
      }
    }
  }
  
  walk(dir);
  return results;
}

async function main() {
  const folderPath = process.argv[2] || "/mnt/c/Users/marce/OneDrive - QL MED/BACKUP_QL MED/NFE/XML";
  const startYear = parseInt(process.argv[3] || '2021');
  
  console.log(`\n📂 Bulk XML Import`);
  console.log(`   Pasta: ${folderPath}`);
  console.log(`   A partir de: ${startYear}`);
  console.log(`   Buscando arquivos XML...\n`);

  // Find company
  const company = await prisma.company.findFirst();
  if (!company) {
    console.error('❌ Nenhuma empresa encontrada no banco. Cadastre uma empresa primeiro.');
    process.exit(1);
  }
  console.log(`🏢 Empresa: ${company.razaoSocial} (${company.cnpj})`);
  const companyCnpjClean = company.cnpj.replace(/\D/g, '');

  // Find XML files
  const xmlFiles = findXmlFiles(folderPath, startYear);
  console.log(`📄 Encontrados ${xmlFiles.length} arquivos XML\n`);

  if (xmlFiles.length === 0) {
    console.log('Nenhum arquivo XML encontrado.');
    process.exit(0);
  }

  // Get existing access keys to skip duplicates efficiently
  console.log('🔍 Carregando chaves de acesso existentes...');
  const existingInvoices = await prisma.invoice.findMany({
    select: { accessKey: true }
  });
  const existingKeys = new Set(existingInvoices.map(i => i.accessKey));
  console.log(`   ${existingKeys.size} notas já cadastradas\n`);

  let imported = 0;
  let skipped = 0;
  let errors = 0;
  let errorDetails = [];
  const batchSize = 50;
  const totalFiles = xmlFiles.length;

  for (let i = 0; i < xmlFiles.length; i += batchSize) {
    const batch = xmlFiles.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(totalFiles / batchSize);
    
    process.stdout.write(`\r⏳ Lote ${batchNum}/${totalBatches} | Importados: ${imported} | Pulados: ${skipped} | Erros: ${errors} | ${((i / totalFiles) * 100).toFixed(1)}%`);

    const promises = batch.map(async (filePath) => {
      try {
        const xmlContent = fs.readFileSync(filePath, 'utf-8');
        const parsed = await parseInvoiceXml(xmlContent);

        // Skip if already exists
        if (existingKeys.has(parsed.accessKey)) {
          skipped++;
          return;
        }

        // Determine direction
        const senderCnpjClean = parsed.senderCnpj.replace(/\D/g, '');
        const direction = senderCnpjClean === companyCnpjClean ? 'issued' : 'received';

        await prisma.invoice.create({
          data: {
            companyId: company.id,
            accessKey: parsed.accessKey,
            type: parsed.type,
            direction,
            number: parsed.number,
            series: parsed.series,
            issueDate: new Date(parsed.issueDate),
            senderCnpj: parsed.senderCnpj,
            senderName: parsed.senderName,
            recipientCnpj: parsed.recipientCnpj,
            recipientName: parsed.recipientName,
            totalValue: parsed.totalValue,
            status: 'received',
            xmlContent,
          }
        });

        existingKeys.add(parsed.accessKey);
        imported++;
      } catch (err) {
        errors++;
        const shortPath = filePath.split('/').slice(-3).join('/');
        if (errorDetails.length < 20) {
          errorDetails.push(`${shortPath}: ${err.message?.substring(0, 100)}`);
        }
      }
    });

    await Promise.all(promises);
  }

  console.log(`\n\n✅ Importação concluída!`);
  console.log(`   📥 Importados: ${imported}`);
  console.log(`   ⏭️  Pulados (duplicados): ${skipped}`);
  console.log(`   ❌ Erros: ${errors}`);

  if (errorDetails.length > 0) {
    console.log(`\n🔍 Primeiros erros:`);
    errorDetails.forEach(e => console.log(`   - ${e}`));
  }

  // Summary by direction
  const summary = await prisma.invoice.groupBy({
    by: ['direction'],
    _count: true
  });
  console.log(`\n📊 Total no banco:`);
  summary.forEach(s => console.log(`   ${s.direction}: ${s._count}`));

  await prisma.$disconnect();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
