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

    // Window anti-join over Invoice XML — kept as raw (core Invoice, not satellite CRUD)
    const invoices = await prisma.$queryRawUnsafe<
      Array<{ cnpj: string; xml_content: string; direction: string }>
    >(
      `SELECT sub.cnpj, sub.xml_content, sub.direction FROM (
        SELECT "recipientCnpj" as cnpj, "xmlContent" as xml_content, "direction",
               ROW_NUMBER() OVER (PARTITION BY "recipientCnpj" ORDER BY "issueDate" DESC) as rn
        FROM "Invoice"
        WHERE "companyId" = $1
          AND "recipientCnpj" = ANY($2::text[])
          AND "xmlContent" IS NOT NULL
        UNION ALL
        SELECT "senderCnpj" as cnpj, "xmlContent" as xml_content, "direction",
               ROW_NUMBER() OVER (PARTITION BY "senderCnpj" ORDER BY "issueDate" DESC) as rn
        FROM "Invoice"
        WHERE "companyId" = $1
          AND "senderCnpj" = ANY($2::text[])
          AND "xmlContent" IS NOT NULL
      ) sub WHERE sub.rn = 1`,
      companyId,
      batch,
    );

    for (const inv of invoices) {
      if (!inv.xml_content) continue;
      const isRecipient = inv.direction === 'issued';
      const enderTag = isRecipient ? 'enderDest' : 'enderEmit';
      const enderBlock = inv.xml_content.match(
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
