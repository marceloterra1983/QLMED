import { NextResponse } from 'next/server';
import { requireEditor, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import { apiError, apiValidationError } from '@/lib/api-error';
import { z } from 'zod';
import { formDataWithLimit, PayloadTooLargeError } from '@/lib/upload-limits';
import { MAX_XLSX_BYTES, XlsxInvalidError, XlsxTooLargeError } from '@/lib/xlsx-limits';
import { processSpicaRows } from '@/lib/spica/import-service';
import { checksumFileBytes, parseSpicaRelFile } from '@/lib/spica/file-parse';

function parseDryRun(raw: FormDataEntryValue | null): boolean {
  if (raw == null) return true;
  const s = String(raw).trim().toLowerCase();
  if (s === 'false' || s === '0' || s === 'no') return false;
  return true;
}

export async function POST(req: Request) {
  try {
    let userId: string;
    try {
      userId = (await requireEditor()).userId;
    } catch (e: unknown) {
      if (e instanceof Error && e.message === 'FORBIDDEN') return forbiddenResponse();
      return unauthorizedResponse();
    }

    const company = await getOrCreateSingleCompany(userId);

    let formData: FormData;
    try {
      formData = await formDataWithLimit(req, MAX_XLSX_BYTES);
    } catch (e: unknown) {
      if (e instanceof PayloadTooLargeError) {
        return NextResponse.json({ error: 'Arquivo muito grande' }, { status: 413 });
      }
      throw e;
    }

    const file = formData.get('file') as File | null;
    const fileSchema = z.object({ file: z.instanceof(File, { message: 'Arquivo nao enviado' }) });
    const fileParsed = fileSchema.safeParse({ file });
    if (!fileParsed.success) return apiValidationError(fileParsed.error);

    const dryRun = parseDryRun(formData.get('dryRun'));
    const confirmChecksum = String(formData.get('confirmChecksum') ?? '').trim() || null;

    const bytes = Buffer.from(await fileParsed.data.file.arrayBuffer());
    const checksum = checksumFileBytes(bytes);

    if (!dryRun) {
      // FR-010: apply exige checksum do dry-run prévio.
      if (!confirmChecksum || confirmChecksum !== checksum) {
        return NextResponse.json(
          {
            error: 'Confirmacao obrigatoria: envie confirmChecksum igual ao checksum do dry-run.',
            checksum,
          },
          { status: 400 },
        );
      }
    }

    let rows;
    try {
      rows = await parseSpicaRelFile(
        new File([bytes], fileParsed.data.file.name || 'Rel_Produtos.csv', {
          type: fileParsed.data.file.type || 'application/octet-stream',
        }),
      );
    } catch (e: unknown) {
      if (e instanceof XlsxTooLargeError) {
        return NextResponse.json({ error: 'Planilha muito grande' }, { status: 413 });
      }
      if (e instanceof XlsxInvalidError) {
        return NextResponse.json({ error: 'Arquivo XLSX invalido' }, { status: 400 });
      }
      throw e;
    }

    if (rows.length === 0) {
      return NextResponse.json({ error: 'Nenhum produto Spica encontrado no arquivo' }, { status: 400 });
    }

    const { summary, sampleUpdates } = await processSpicaRows(rows, {
      companyId: company.id,
      dryRun,
    });

    return NextResponse.json({
      dryRun,
      checksum,
      summary: {
        totalRows: summary.totalRows,
        inserted: summary.inserted,
        updatedExisting: summary.updatedExisting,
        unchanged: summary.unchanged,
        quarantinedDuplicates: summary.quarantinedDuplicates,
        warningsCount: summary.warningsCount,
      },
      samples: sampleUpdates,
    });
  } catch (error) {
    return apiError(error, 'products/import-spica');
  }
}
