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
  sourceInvoiceId: string | null;
}): Promise<void> {
  if (!data.cnpj) return;
  await ensureContactFiscalTable();
  await prisma.$executeRawUnsafe(
    `INSERT INTO contact_fiscal (id, company_id, cnpj, ie, im, crt, uf, source_invoice_id, extracted_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
     ON CONFLICT (company_id, cnpj) DO UPDATE SET
       ie = COALESCE(EXCLUDED.ie, contact_fiscal.ie),
       im = COALESCE(EXCLUDED.im, contact_fiscal.im),
       crt = COALESCE(EXCLUDED.crt, contact_fiscal.crt),
       uf = COALESCE(EXCLUDED.uf, contact_fiscal.uf),
       source_invoice_id = EXCLUDED.source_invoice_id,
       extracted_at = NOW()`,
    randomUUID(), data.companyId, data.cnpj,
    data.ie, data.im, data.crt, data.uf, data.sourceInvoiceId,
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
