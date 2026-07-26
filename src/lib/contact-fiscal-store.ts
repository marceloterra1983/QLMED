import { randomUUID } from 'crypto';
import prisma from '@/lib/prisma';

export interface ContactFiscalRow {
  id: string;
  companyId: string;
  cnpj: string;
  ie: string | null;
  im: string | null;
  crt: string | null;
  uf: string | null;
  city: string | null;
  sourceInvoiceId: string | null;
  extractedAt: Date;
}

// contact_fiscal is schema-owned (Phase 11 baseline). No CREATE/ALTER at runtime.

export async function ensureContactFiscalTable(): Promise<void> {
  return;
}

function mapRow(r: {
  id: string;
  companyId: string;
  cnpj: string;
  ie: string | null;
  im: string | null;
  crt: string | null;
  uf: string | null;
  city: string | null;
  sourceInvoiceId: string | null;
  extractedAt: Date | null;
}): ContactFiscalRow {
  return {
    id: r.id,
    companyId: r.companyId,
    cnpj: r.cnpj,
    ie: r.ie ?? null,
    im: r.im ?? null,
    crt: r.crt ?? null,
    uf: r.uf ?? null,
    city: r.city ?? null,
    sourceInvoiceId: r.sourceInvoiceId ?? null,
    extractedAt: r.extractedAt ?? new Date(0),
  };
}

// ── Upsert ──

export async function upsertContactFiscal(data: {
  companyId: string;
  cnpj: string;
  ie: string | null;
  im: string | null;
  crt: string | null;
  uf: string | null;
  city?: string | null;
  sourceInvoiceId: string | null;
}): Promise<void> {
  if (!data.cnpj) return;

  const existing = await prisma.contactFiscal.findUnique({
    where: {
      companyId_cnpj: {
        companyId: data.companyId,
        cnpj: data.cnpj,
      },
    },
  });

  const now = new Date();

  if (existing) {
    // COALESCE semantics from previous raw SQL
    await prisma.contactFiscal.update({
      where: { id: existing.id },
      data: {
        ie: data.ie ?? existing.ie,
        im: data.im ?? existing.im,
        crt: data.crt ?? existing.crt,
        uf: data.uf ?? existing.uf,
        city: data.city ?? existing.city,
        sourceInvoiceId: data.sourceInvoiceId,
        extractedAt: now,
      },
    });
    return;
  }

  await prisma.contactFiscal.create({
    data: {
      id: randomUUID(),
      companyId: data.companyId,
      cnpj: data.cnpj,
      ie: data.ie,
      im: data.im,
      crt: data.crt,
      uf: data.uf,
      city: data.city ?? null,
      sourceInvoiceId: data.sourceInvoiceId,
      extractedAt: now,
    },
  });
}

// ── Queries ──

export async function getContactFiscal(
  companyId: string,
  cnpj: string,
): Promise<ContactFiscalRow | null> {
  const row = await prisma.contactFiscal.findUnique({
    where: { companyId_cnpj: { companyId, cnpj } },
  });
  return row ? mapRow(row) : null;
}

export async function getContactFiscalBatch(
  companyId: string,
  cnpjs: string[],
): Promise<ContactFiscalRow[]> {
  if (cnpjs.length === 0) return [];
  const rows = await prisma.contactFiscal.findMany({
    where: { companyId, cnpj: { in: cnpjs } },
  });
  return rows.map(mapRow);
}

// ── City lookup for customers/suppliers routes ──

export async function getCityByCnpjs(
  companyId: string,
  cnpjs: string[],
): Promise<Map<string, string>> {
  const cityMap = new Map<string, string>();
  if (cnpjs.length === 0) return cityMap;
  try {
    const rows = await prisma.contactFiscal.findMany({
      where: {
        companyId,
        cnpj: { in: cnpjs },
        city: { not: null },
      },
      select: { cnpj: true, city: true },
    });
    for (const row of rows) {
      if (row.city) cityMap.set(row.cnpj, row.city);
    }
  } catch {
    // table may not exist yet — return empty map
  }
  return cityMap;
}

// ── Backfill city for existing contact_fiscal rows with city IS NULL ──

export async function backfillContactFiscalCity(companyId: string): Promise<number> {
  const nullCityRows = await prisma.contactFiscal.findMany({
    where: { companyId, city: null },
    select: { cnpj: true },
  });
  if (nullCityRows.length === 0) return 0;

  const cnpjsToBackfill = nullCityRows.map((r) => r.cnpj);
  let updated = 0;

  const batchSize = 50;
  for (let i = 0; i < cnpjsToBackfill.length; i += batchSize) {
    const batch = cnpjsToBackfill.slice(i, i + batchSize);

    // Most recent invoice per CNPJ as recipient and as sender (replaces window SQL)
    const [asRecipient, asSender] = await Promise.all([
      prisma.invoice.findMany({
        where: {
          companyId,
          recipientCnpj: { in: batch },
          // not:'' also drops NULL for text columns
          xmlContent: { not: '' },
        },
        orderBy: { issueDate: 'desc' },
        select: {
          recipientCnpj: true,
          xmlContent: true,
          direction: true,
        },
      }),
      prisma.invoice.findMany({
        where: {
          companyId,
          senderCnpj: { in: batch },
          xmlContent: { not: '' },
        },
        orderBy: { issueDate: 'desc' },
        select: {
          senderCnpj: true,
          xmlContent: true,
          direction: true,
        },
      }),
    ]);

    type InvHit = { cnpj: string; xmlContent: string; direction: string };
    const hits: InvHit[] = [];
    const seenRecipient = new Set<string>();
    for (const inv of asRecipient) {
      const cnpj = inv.recipientCnpj;
      if (!cnpj || !inv.xmlContent || seenRecipient.has(cnpj)) continue;
      seenRecipient.add(cnpj);
      hits.push({ cnpj, xmlContent: inv.xmlContent, direction: inv.direction });
    }
    const seenSender = new Set<string>();
    for (const inv of asSender) {
      const cnpj = inv.senderCnpj;
      if (!cnpj || !inv.xmlContent || seenSender.has(cnpj)) continue;
      seenSender.add(cnpj);
      hits.push({ cnpj, xmlContent: inv.xmlContent, direction: inv.direction });
    }

    for (const inv of hits) {
      // issued → party is dest (enderDest); received → emit (enderEmit)
      const isRecipient = inv.direction === 'issued';
      const enderTag = isRecipient ? 'enderDest' : 'enderEmit';
      const enderBlock = inv.xmlContent.match(
        new RegExp(`<${enderTag}\\b[^>]*>[\\s\\S]*?<\\/${enderTag}>`, 'i'),
      )?.[0];
      if (!enderBlock) continue;

      const xMun = enderBlock.match(/<xMun>([\s\S]*?)<\/xMun>/i)?.[1]?.trim();
      const uf = enderBlock.match(/<UF>([\s\S]*?)<\/UF>/i)?.[1]?.trim();
      if (!xMun) continue;

      const city = uf ? `${xMun} - ${uf}` : xMun;
      const result = await prisma.contactFiscal.updateMany({
        where: { companyId, cnpj: inv.cnpj, city: null },
        data: { city },
      });
      if (result.count > 0) updated++;
    }
  }

  return updated;
}
