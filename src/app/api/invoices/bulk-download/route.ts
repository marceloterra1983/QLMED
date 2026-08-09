import JSZip from 'jszip';
import { NextResponse } from 'next/server';

import { forbiddenResponse, requireEditor, unauthorizedResponse } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import { GET as getInvoicePdfDownload } from '@/app/api/invoices/[id]/pdf/route';
import { apiError, apiValidationError } from '@/lib/api-error';
import { invoiceBulkDownloadSchema } from '@/lib/schemas/invoice';


const MAX_BULK_XML_ITEMS = 200;
const MAX_BULK_PDF_ITEMS = 25;

type BulkDownloadFormat = 'xml' | 'pdf';

function sanitizeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').trim() || 'download';
}

function getFilenameFromDisposition(contentDisposition: string | null): string | null {
  if (!contentDisposition) return null;

  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return sanitizeFilename(decodeURIComponent(utf8Match[1]));
    } catch {
      return sanitizeFilename(utf8Match[1]);
    }
  }

  const basicMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
  if (basicMatch?.[1]) {
    return sanitizeFilename(basicMatch[1]);
  }

  return null;
}

function buildZipFilename(format: BulkDownloadFormat): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const mi = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  return `documentos_${format}_${yyyy}${mm}${dd}_${hh}${mi}${ss}.zip`;
}


export async function POST(req: Request) {
  try {
    let userId: string;
    try {
      ({ userId } = await requireEditor());
    } catch (err) {
      if (err instanceof Error && err.message === 'FORBIDDEN') return forbiddenResponse();
      return unauthorizedResponse();
    }

    const company = await getOrCreateSingleCompany(userId);

    const rawBody = await req.json().catch(() => null);
    const validated = invoiceBulkDownloadSchema.safeParse(rawBody);
    if (!validated.success) return apiValidationError(validated.error);

    const payload = {
      ids: Array.from(new Set(validated.data.ids.map((id) => id.trim()).filter(Boolean))),
      format: validated.data.format,
    };
    if (payload.ids.length === 0) {
      return NextResponse.json({ error: 'Payload invalido' }, { status: 400 });
    }

    const maxItems = payload.format === 'pdf' ? MAX_BULK_PDF_ITEMS : MAX_BULK_XML_ITEMS;
    if (payload.ids.length > maxItems) {
      return NextResponse.json(
        { error: `Limite de ${maxItems} documento(s) por lote ${payload.format.toUpperCase()}` },
        { status: 413 }
      );
    }

    const ids = payload.ids;
    const invoices = await prisma.invoice.findMany({
      where: {
        id: { in: ids },
        companyId: company.id,
      },
      select: {
        id: true,
        type: true,
        accessKey: true,
        xmlContent: true,
      },
    });

    if (invoices.length === 0) {
      return NextResponse.json({ error: 'Nenhum documento encontrado' }, { status: 404 });
    }

    const invoiceById = new Map(invoices.map((invoice) => [invoice.id, invoice]));
    const zip = new JSZip();
    let added = 0;

    for (const id of ids) {
      const invoice = invoiceById.get(id);
      if (!invoice) continue;

      if (payload.format === 'xml') {
        const xmlFilename = sanitizeFilename(`${invoice.type}_${invoice.accessKey}.xml`);
        zip.file(xmlFilename, invoice.xmlContent);
        added += 1;
        continue;
      }

      // Reusa o gerador existente de PDF para manter a mesma renderização dos downloads individuais.
      const pdfResponse = await getInvoicePdfDownload(
        new Request(`http://internal/api/invoices/${invoice.id}/pdf?download=true`),
        { params: Promise.resolve({ id: invoice.id }) },
      );

      if (!pdfResponse.ok) {
        continue;
      }

      const pdfData = Buffer.from(await pdfResponse.arrayBuffer());
      const pdfFilename = getFilenameFromDisposition(pdfResponse.headers.get('Content-Disposition'))
        || sanitizeFilename(`${invoice.type}_${invoice.accessKey}.pdf`);
      zip.file(pdfFilename, pdfData);
      added += 1;
    }

    if (added === 0) {
      return NextResponse.json({ error: 'Nenhum arquivo pôde ser gerado no lote' }, { status: 500 });
    }

    const zipBuffer = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });
    const zipBytes = new Uint8Array(zipBuffer);

    const zipFilename = buildZipFilename(payload.format);
    return new Response(zipBytes, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${zipFilename}"`,
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      },
    });
  } catch (error) {
    return apiError(error, 'invoices/bulk-download');
  }
}
