import prisma from '@/lib/prisma';
import { normalizeSpicaRelRow, SpicaRelRowInput } from '@/lib/spica/parse';
import { normalizeToken } from '@/lib/product-aggregation/shared';
import { randomUUID } from 'crypto';

export interface SpicaImportSummary {
  totalRows: number;
  inserted: number;
  updatedExisting: number;
  unchanged: number;
  quarantinedDuplicates: number;
  warningsCount: number;
}

export function buildCanonicalSpicaProductKey(ref: string, codigo: string, isRefUnique: boolean): string {
  const normRef = normalizeToken(ref);
  if (normRef && normRef !== '_' && normRef !== '-' && isRefUnique) {
    return `CODE:${normRef}::UNIT:UN`;
  }
  return `SPICA:${codigo}`;
}

export interface ProcessSpicaImportOptions {
  companyId: string;
  dryRun?: boolean;
}

export async function processSpicaRows(
  rows: SpicaRelRowInput[],
  options: ProcessSpicaImportOptions,
): Promise<{
  summary: SpicaImportSummary;
  sampleUpdates: Array<{ codigo: string; ref: string; action: string; productKey: string }>;
}> {
  const { companyId, dryRun = false } = options;

  // 1. Contar frequências das referências para saber quais são únicas
  const refFreq = new Map<string, number>();
  for (const r of rows) {
    const ref = normalizeToken(r.referencia);
    if (ref) {
      refFreq.set(ref, (refFreq.get(ref) || 0) + 1);
    }
  }

  // 2. Carregar produtos existentes do portal para mapeamento
  const existingRows = await prisma.productRegistry.findMany({
    where: { companyId },
    select: {
      id: true,
      productKey: true,
      code: true,
      codigo: true,
      description: true,
      anvisaCode: true,
      anvisaSource: true,
      productRefs: true,
      fiscalSitTributaria: true,
    },
  });

  const existingByKey = new Map(existingRows.map((r) => [r.productKey, r]));
  const existingByCodeUpper = new Map<string, typeof existingRows[0]>();
  for (const r of existingRows) {
    if (r.code) {
      existingByCodeUpper.set(r.code.trim().toUpperCase(), r);
    }
  }

  let inserted = 0;
  let updatedExisting = 0;
  let unchanged = 0;
  let quarantinedDuplicates = 0;
  let warningsCount = 0;

  const sampleUpdates: Array<{ codigo: string; ref: string; action: string; productKey: string }> = [];

  const toCreate: any[] = [];
  const toUpdate: Array<{ id: string; data: any; productKey: string; codigo: string; ref: string }> = [];

  for (const raw of rows) {
    const norm = normalizeSpicaRelRow(raw);
    const isRefUnique = refFreq.get(normalizeToken(norm.referencia)) === 1;

    if (!isRefUnique && norm.referencia && norm.referencia !== '_') {
      quarantinedDuplicates++;
    }
    if (norm.tipoInvalid || norm.anvisaInvalid || norm.fiscalInconsistente) {
      warningsCount++;
    }

    const canonicalKey = buildCanonicalSpicaProductKey(norm.referencia, norm.codigo, isRefUnique);

    // Tenta encontrar produto existente
    // Prioridade 1: mesma productKey
    // Prioridade 2: code do portal == Referência do Spica (se única)
    let match = existingByKey.get(canonicalKey);
    if (!match && isRefUnique && norm.referencia) {
      match = existingByCodeUpper.get(norm.referencia.trim().toUpperCase());
    }

    if (match) {
      // Produto já existia (veio das NF-e do portal) -> Enriquecer com a verdade mestre do Spica
      const mergedRefs = Array.from(new Set([...(match.productRefs || []), norm.referencia].filter(Boolean)));
      
      const updateData: any = {
        codigo: norm.codigo, // O código oficial de 6 dígitos do Spica
        productRefs: mergedRefs,
        productType: norm.productType,
        productSubtype: norm.productSubtype,
        outOfLine: norm.outOfLine,
        instrumental: norm.instrumental,
        manufacturerShortName: norm.manufacturerShortName,
        defaultSupplier: norm.defaultSupplier,
        fiscalSitTributaria: norm.fiscalSitTributaria,
        fiscalOrigem: norm.fiscalOrigem,
        fiscalNomeTributacao: norm.fiscalNomeTributacao,
        fiscalIcms: norm.fiscalIcms,
        fiscalPis: norm.fiscalPis,
        fiscalCofins: norm.fiscalCofins,
        fiscalIpi: norm.fiscalIpi,
        fiscalObs: norm.fiscalObs,
        updatedAt: new Date(),
      };

      // ANVISA: preenche se não tiver ou se veio de fonte não-manual
      if (!match.anvisaCode && norm.anvisaCode) {
        updateData.anvisaCode = norm.anvisaCode;
        updateData.anvisaSource = 'spica';
      }
      // NCM: se vazio no portal, usa Spica
      if (!match.fiscalSitTributaria && norm.fiscalSitTributaria) {
        updateData.fiscalSitTributaria = norm.fiscalSitTributaria;
      }

      toUpdate.push({
        id: match.id,
        data: updateData,
        productKey: match.productKey,
        codigo: norm.codigo,
        ref: norm.referencia,
      });
      updatedExisting++;
      if (sampleUpdates.length < 20) {
        sampleUpdates.push({ codigo: norm.codigo, ref: norm.referencia, action: 'UPDATE_EXISTING', productKey: match.productKey });
      }
    } else {
      // Novo produto Spica (ainda não tinha nota no portal) -> INSERT
      const createData = {
        id: randomUUID(),
        companyId,
        productKey: canonicalKey,
        code: norm.referencia || norm.codigo,
        description: norm.nome,
        ncm: norm.ncm,
        unit: 'UN',
        anvisaCode: norm.anvisaCode,
        anvisaSource: norm.anvisaCode ? 'spica' : null,
        codigo: norm.codigo,
        productRefs: norm.referencia ? [norm.referencia] : [],
        productType: norm.productType,
        productSubtype: norm.productSubtype,
        outOfLine: norm.outOfLine,
        instrumental: norm.instrumental,
        manufacturerShortName: norm.manufacturerShortName,
        defaultSupplier: norm.defaultSupplier,
        fiscalSitTributaria: norm.fiscalSitTributaria,
        fiscalOrigem: norm.fiscalOrigem,
        fiscalNomeTributacao: norm.fiscalNomeTributacao,
        fiscalIcms: norm.fiscalIcms,
        fiscalPis: norm.fiscalPis,
        fiscalCofins: norm.fiscalCofins,
        fiscalIpi: norm.fiscalIpi,
        fiscalObs: norm.fiscalObs,
      };

      toCreate.push(createData);
      inserted++;
      if (sampleUpdates.length < 20) {
        sampleUpdates.push({ codigo: norm.codigo, ref: norm.referencia, action: 'INSERT_NEW', productKey: canonicalKey });
      }
    }
  }

  if (!dryRun) {
    // Executa em lotes dentro de transações para performance e atomicidade
    const BATCH_SIZE = 400;

    // Atualiza existentes
    for (let i = 0; i < toUpdate.length; i += BATCH_SIZE) {
      const batch = toUpdate.slice(i, i + BATCH_SIZE);
      await prisma.$transaction(
        batch.map((item) =>
          prisma.productRegistry.update({
            where: { id: item.id },
            data: item.data,
          })
        )
      );
    }

    // Insere novos
    for (let i = 0; i < toCreate.length; i += BATCH_SIZE) {
      const batch = toCreate.slice(i, i + BATCH_SIZE);
      await prisma.productRegistry.createMany({
        data: batch,
        skipDuplicates: true,
      });
    }
  }

  return {
    summary: {
      totalRows: rows.length,
      inserted,
      updatedExisting,
      unchanged,
      quarantinedDuplicates,
      warningsCount,
    },
    sampleUpdates,
  };
}
