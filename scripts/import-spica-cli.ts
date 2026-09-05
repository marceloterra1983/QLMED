import prisma from '../src/lib/prisma';
import { processSpicaRows } from '../src/lib/spica/import-service';
import { SpicaRelRowInput } from '../src/lib/spica/parse';
import * as fs from 'fs';
import * as path from 'path';

function parseCsv(content: string): SpicaRelRowInput[] {
  const lines = content.split('\n');
  const rows: SpicaRelRowInput[] = [];
  if (lines.length <= 1) return rows;

  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    // Parse CSV line handling potential quotes
    const values: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let charIndex = 0; charIndex < line.length; charIndex++) {
      const c = line[charIndex];
      if (c === '"') {
        inQuotes = !inQuotes;
      } else if (c === ',' && !inQuotes) {
        values.push(cur);
        cur = '';
      } else {
        cur += c;
      }
    }
    values.push(cur);

    if (values.length < 10) continue;

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

  return rows;
}

async function main() {
  const isApply = process.argv.includes('--apply');
  const dryRun = !isApply;

  console.log(`====================================================`);
  console.log(`IMPORTADOR SPICA -> PORTAL QLMED`);
  console.log(`Modo: ${dryRun ? 'DRY-RUN (Simulação - Nenhuma alteração no banco)' : 'APPLY (GRAVAÇÃO REAL NO BANCO)'}`);
  console.log(`====================================================\n`);

  const csvPath = path.resolve(__dirname, '../tmp/spica-import/rel_produtos.csv');
  if (!fs.existsSync(csvPath)) {
    console.error(`Arquivo não encontrado: ${csvPath}`);
    process.exit(1);
  }

  const content = fs.readFileSync(csvPath, 'utf-8');
  const rows = parseCsv(content);
  console.log(`Lidos ${rows.length} produtos do Spica ODS/CSV.`);

  // Pega a empresa canônica
  const company = await prisma.company.findFirst({
    where: { cnpj: '07832309000197' },
  });

  if (!company) {
    console.error(`Empresa 07832309000197 não encontrada no banco.`);
    process.exit(1);
  }

  console.log(`Empresa destino: ${company.razaoSocial} (ID: ${company.id})\n`);

  const t0 = Date.now();
  const result = await processSpicaRows(rows, {
    companyId: company.id,
    dryRun,
  });
  const t1 = Date.now();

  console.log(`\n================ RESULTADO DA EXECUÇÃO ================`);
  console.log(`Tempo decorrido: ${((t1 - t0) / 1000).toFixed(2)}s`);
  console.log(`Total de produtos Spica processados: ${result.summary.totalRows}`);
  console.log(`Produtos que já existiam (casados e enriquecidos com dados fiscais Spica): ${result.summary.updatedExisting}`);
  console.log(`Produtos novos cadastrados no banco (Spica-only): ${result.summary.inserted}`);
  console.log(`Referências que têm mais de 1 código (quarentena de chave): ${result.summary.quarantinedDuplicates}`);
  console.log(`Avisos (tipos inválidos, alíquotas zeradas ou ANVISA curto): ${result.summary.warningsCount}`);
  console.log(`=======================================================\n`);

  console.log(`Amostra das ações realizadas:`);
  result.sampleUpdates.slice(0, 10).forEach((s) => {
    console.log(`  [${s.action}] Cod: ${s.codigo} | Ref: ${s.ref} | Key: ${s.productKey}`);
  });

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Erro na execução:', err);
  process.exit(1);
});
