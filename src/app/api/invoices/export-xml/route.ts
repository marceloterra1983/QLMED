import { NextRequest, NextResponse } from 'next/server';
import { InvoiceType, InvoiceDirection } from '@prisma/client';
import { requireAuth, unauthorizedResponse } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { saveXmlToFile } from '@/lib/xml-file-store';

const VALID_TYPES = new Set<string>(Object.values(InvoiceType));
const VALID_DIRECTIONS = new Set<string>(Object.values(InvoiceDirection));

export async function POST(request: NextRequest) {
  let userId: string;
  try {
    userId = await requireAuth();
  } catch {
    return unauthorizedResponse();
  }

  const body = await request.json().catch(() => ({}));
  const years = Math.min(Number(body.years) || 5, 10);
  const types = (Array.isArray(body.types) ? body.types : ['NFE', 'CTE', 'NFSE'])
    .filter((t: string) => VALID_TYPES.has(t)) as InvoiceType[];
  const directions = (Array.isArray(body.directions) ? body.directions : ['received', 'issued'])
    .filter((d: string) => VALID_DIRECTIONS.has(d)) as InvoiceDirection[];
  const batchSize = 200;

  const since = new Date();
  since.setFullYear(since.getFullYear() - years);

  const totalCount = await prisma.invoice.count({
    where: {
      issueDate: { gte: since },
      type: { in: types },
      direction: { in: directions },
      xmlContent: { not: '' },
    },
  });

  // Process in background — return immediately with count
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let exported = 0;
      let skipped = 0;
      let errors = 0;
      let cursor: string | undefined;

      try {
        while (true) {
          const invoices = await prisma.invoice.findMany({
            where: {
              issueDate: { gte: since },
              type: { in: types },
              direction: { in: directions },
              xmlContent: { not: '' },
            },
            select: {
              id: true,
              accessKey: true,
              type: true,
              issueDate: true,
              xmlContent: true,
            },
            orderBy: { id: 'asc' },
            take: batchSize,
            ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
          });

          if (invoices.length === 0) break;

          for (const inv of invoices) {
            try {
              const result = await saveXmlToFile(
                inv.accessKey,
                inv.type,
                inv.xmlContent,
                inv.issueDate,
              );
              if (result) {
                exported++;
              } else {
                skipped++;
              }
            } catch {
              errors++;
            }
          }

          cursor = invoices[invoices.length - 1].id;

          const progress = JSON.stringify({
            exported,
            skipped,
            errors,
            total: totalCount,
            percent: Math.round(((exported + skipped + errors) / totalCount) * 100),
          });
          controller.enqueue(encoder.encode(progress + '\n'));
        }

        const final = JSON.stringify({
          done: true,
          exported,
          skipped,
          errors,
          total: totalCount,
        });
        controller.enqueue(encoder.encode(final + '\n'));
      } catch (err) {
        const errorMsg = JSON.stringify({ error: (err as Error).message });
        controller.enqueue(encoder.encode(errorMsg + '\n'));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Transfer-Encoding': 'chunked',
    },
  });
}
