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

// ── DB row interface (snake_case, matching SQL columns) ──

interface ContactFiscalDbRow {
  id: string;
  company_id: string;
  cnpj: string;
  ie: string | null;
  im: string | null;
  crt: string | null;
  uf: string | null;
  city: string | null;
  source_invoice_id: string | null;
  extracted_at: string | Date;
}

// ── Table init ──

type InitState = { promise?: Promise<void> };
const globalForFiscal = globalThis as unknown as { contactFiscalInitState?: InitState };
if (!globalForFiscal.contactFiscalInitState) globalForFiscal.contactFiscalInitState = {};
const initState = globalForFiscal.contactFiscalInitState;

export async function ensureContactFiscalTable(): Promise<void> {
  if (!initState.promise) {
    initState.promise = (async () => {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS contact_fiscal (
          id TEXT PRIMARY KEY,
          company_id TEXT NOT NULL,
          cnpj TEXT NOT NULL,
          ie TEXT,
          im TEXT,
          crt TEXT,
          uf TEXT,
          source_invoice_id TEXT,
          extracted_at TIMESTAMPTZ DEFAULT NOW(),
          UNIQUE(company_id, cnpj)
        )
      `);
      await prisma.$executeRawUnsafe(`
        ALTER TABLE contact_fiscal ADD COLUMN IF NOT EXISTS city TEXT
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS idx_contact_fiscal_company
        ON contact_fiscal(company_id)
      `);
    })().catch((err) => {
      initState.promise = undefined;
      throw err;
    });
  }
  return initState.promise;
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
  await ensureContactFiscalTable();
  await prisma.$executeRawUnsafe(
    `INSERT INTO contact_fiscal (id, company_id, cnpj, ie, im, crt, uf, city, source_invoice_id, extracted_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
     ON CONFLICT (company_id, cnpj) DO UPDATE SET
       ie = COALESCE(EXCLUDED.ie, contact_fiscal.ie),
       im = COALESCE(EXCLUDED.im, contact_fiscal.im),
       crt = COALESCE(EXCLUDED.crt, contact_fiscal.crt),
       uf = COALESCE(EXCLUDED.uf, contact_fiscal.uf),
       city = COALESCE(EXCLUDED.city, contact_fiscal.city),
       source_invoice_id = EXCLUDED.source_invoice_id,
       extracted_at = NOW()`,
    randomUUID(), data.companyId, data.cnpj,
    data.ie, data.im, data.crt, data.uf, data.city ?? null, data.sourceInvoiceId,
  );
}

// ── Queries ──

function mapRow(r: ContactFiscalDbRow): ContactFiscalRow {
  return {
    id: r.id,
    companyId: r.company_id,
    cnpj: r.cnpj,
    ie: r.ie ?? null,
    im: r.im ?? null,
    crt: r.crt ?? null,
    uf: r.uf ?? null,
    city: r.city ?? null,
    sourceInvoiceId: r.source_invoice_id ?? null,
    extractedAt: new Date(r.extracted_at),
  };
}

export async function getContactFiscal(
  companyId: string,
  cnpj: string,
): Promise<ContactFiscalRow | null> {
  await ensureContactFiscalTable();
  const rows = await prisma.$queryRawUnsafe<ContactFiscalDbRow[]>(
    `SELECT * FROM contact_fiscal WHERE company_id = $1 AND cnpj = $2`,
    companyId, cnpj,
  );
  return rows.length > 0 ? mapRow(rows[0]) : null;
}

export async function getContactFiscalBatch(
  companyId: string,
  cnpjs: string[],
): Promise<ContactFiscalRow[]> {
  if (cnpjs.length === 0) return [];
  await ensureContactFiscalTable();
  const rows = await prisma.$queryRawUnsafe<ContactFiscalDbRow[]>(
    `SELECT * FROM contact_fiscal WHERE company_id = $1 AND cnpj = ANY($2::text[])`,
    companyId, cnpjs,
  );
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
    await ensureContactFiscalTable();
    const rows = await prisma.$queryRawUnsafe<Array<{ cnpj: string; city: string }>>(
      `SELECT cnpj, city FROM contact_fiscal
       WHERE company_id = $1 AND cnpj = ANY($2::text[]) AND city IS NOT NULL`,
      companyId, cnpjs,
    );
    for (const row of rows) {
      cityMap.set(row.cnpj, row.city);
    }
  } catch {
    // table may not exist yet — return empty map
  }
  return cityMap;
}

// ── Backfill city for existing contact_fiscal rows with city IS NULL ──

export async function backfillContactFiscalCity(companyId: string): Promise<number> {
  await ensureContactFiscalTable();

  // Find contact_fiscal rows that have no city
  const nullCityRows = await prisma.$queryRawUnsafe<Array<{ cnpj: string }>>(
    `SELECT cnpj FROM contact_fiscal WHERE company_id = $1 AND city IS NULL`,
    companyId,
  );
  if (nullCityRows.length === 0) return 0;

  const cnpjsToBackfill = nullCityRows.map((r) => r.cnpj);
  let updated = 0;

  // Process in batches of 50
  const batchSize = 50;
  for (let i = 0; i < cnpjsToBackfill.length; i += batchSize) {
    const batch = cnpjsToBackfill.slice(i, i + batchSize);

    // Get most recent invoice with xmlContent for each CNPJ (check both emit and dest)
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
      companyId, batch,
    );

    for (const inv of invoices) {
      if (!inv.xml_content) continue;
      // For issued invoices the CNPJ is in enderDest, for received in enderEmit
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
      await prisma.$executeRawUnsafe(
        `UPDATE contact_fiscal SET city = $1 WHERE company_id = $2 AND cnpj = $3 AND city IS NULL`,
        city, companyId, inv.cnpj,
      );
      updated++;
    }
  }

  return updated;
}
