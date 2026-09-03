import prisma from '@/lib/prisma';
import { extractAndStoreDuplicatas } from '@/lib/invoice-duplicata-store';
import { createLogger } from '@/lib/logger';

const log = createLogger('backfill-duplicatas-cli');

export interface BackfillOptions {
  companyId?: string;
  batchSize?: number;
  maxBatches?: number;
  dryRun?: boolean;
  onProgress?: (progress: { processed: number; batchCount: number; remaining?: number }) => void;
}

export interface BackfillSummary {
  totalProcessed: number;
  batchCount: number;
  completed: boolean;
}

export async function runBackfillDuplicatas(opts: BackfillOptions = {}): Promise<BackfillSummary> {
  const batchSize = Math.max(1, Math.min(opts.batchSize ?? 200, 1000));
  const maxBatches = opts.maxBatches ?? Number.POSITIVE_INFINITY;
  const dryRun = opts.dryRun ?? false;

  let totalProcessed = 0;
  let batchCount = 0;
  let completed = false;

  while (batchCount < maxBatches) {
    const whereClause: Record<string, unknown> = {
      type: 'NFE',
      duplicatas: { none: {} },
    };
    if (opts.companyId) {
      whereClause.companyId = opts.companyId;
    }

    const pendingInvoices = await prisma.invoice.findMany({
      where: whereClause,
      take: batchSize,
      orderBy: { id: 'asc' },
      select: {
        id: true,
        companyId: true,
        xmlContent: true,
        number: true,
      },
    });

    if (pendingInvoices.length === 0) {
      completed = true;
      break;
    }

    batchCount++;
    for (const inv of pendingInvoices) {
      if (!dryRun) {
        await extractAndStoreDuplicatas(inv.id, inv.companyId, inv.xmlContent || '');
      }
      totalProcessed++;
    }

    if (opts.onProgress) {
      opts.onProgress({ processed: totalProcessed, batchCount });
    }

    if (pendingInvoices.length < batchSize) {
      completed = true;
      break;
    }
  }

  log.info({ totalProcessed, batchCount, completed }, 'Backfill duplicatas finalizado');
  return { totalProcessed, batchCount, completed };
}

if (process.argv[1]?.includes('backfill-all-duplicatas')) {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const batchArg = args.find((a) => a.startsWith('--batch-size='));
  const batchSize = batchArg ? Number(batchArg.split('=')[1]) : 200;

  console.log(`[Backfill Duplicatas] Iniciando backfill (batchSize: ${batchSize}, dryRun: ${dryRun})...`);
  runBackfillDuplicatas({
    batchSize,
    dryRun,
    onProgress: ({ processed, batchCount }) => {
      console.log(`[Progresso] Lote ${batchCount}: ${processed} notas processadas...`);
    },
  })
    .then((summary) => {
      console.log(`[Backfill Concluído] Total: ${summary.totalProcessed} em ${summary.batchCount} lotes.`);
      process.exit(0);
    })
    .catch((err) => {
      console.error('[Backfill Erro]', err);
      process.exit(1);
    });
}
