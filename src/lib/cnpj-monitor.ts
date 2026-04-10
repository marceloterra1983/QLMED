import { randomUUID } from 'crypto';
import prisma from '@/lib/prisma';
import { lookupCnpj, ensureCnpjCacheTable } from '@/lib/cnpj-lookup';
import { createLogger } from '@/lib/logger';

const log = createLogger('cnpj-monitor');

// ── Table init ──

type InitState = { promise?: Promise<void> };
const globalForMon = globalThis as unknown as { cnpjMonitorInitState?: InitState };
if (!globalForMon.cnpjMonitorInitState) globalForMon.cnpjMonitorInitState = {};
const initState = globalForMon.cnpjMonitorInitState;

export async function ensureCnpjMonitoringTable(): Promise<void> {
  if (!initState.promise) {
    initState.promise = (async () => {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS cnpj_monitoring (
          id TEXT PRIMARY KEY,
          company_id TEXT NOT NULL,
          cnpj TEXT NOT NULL,
          contact_name TEXT,
          previous_status TEXT,
          current_status TEXT,
          changed_at TIMESTAMPTZ,
          checked_at TIMESTAMPTZ DEFAULT NOW(),
          UNIQUE(company_id, cnpj)
        )
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS idx_cnpj_mon_company ON cnpj_monitoring(company_id)
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS idx_cnpj_mon_changed ON cnpj_monitoring(company_id, changed_at)
      `);
    })().catch((err) => {
      initState.promise = undefined;
      throw err;
    });
  }
  return initState.promise;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Run a batch CNPJ status check.
 * Checks distinct CNPJs from invoices, compares with cached status,
 * and records any changes in cnpj_monitoring.
 */
export async function runBatchCnpjCheck(
  companyId: string,
  batchSize = 10,
  delayMs = 2000,
): Promise<{ checked: number; changed: number; errors: number }> {
  await ensureCnpjMonitoringTable();
  await ensureCnpjCacheTable();

  // Get distinct CNPJs from invoices
  const cnpjRows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT DISTINCT "senderCnpj" as cnpj, "senderName" as name FROM "Invoice"
     WHERE "companyId" = $1 AND "senderCnpj" IS NOT NULL AND "senderCnpj" != ''
     UNION
     SELECT DISTINCT "recipientCnpj" as cnpj, "recipientName" as name FROM "Invoice"
     WHERE "companyId" = $1 AND "recipientCnpj" IS NOT NULL AND "recipientCnpj" != ''`,
    companyId,
  );

  // Filter to 14-digit CNPJs only (not CPFs)
  const contacts = cnpjRows
    .map((r) => ({ cnpj: (r.cnpj || '').replace(/\D/g, ''), name: r.name || '' }))
    .filter((c) => c.cnpj.length === 14);

  // Get last known status for these CNPJs
  const existingRows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT cnpj, current_status FROM cnpj_monitoring WHERE company_id = $1`,
    companyId,
  );
  const knownStatus = new Map<string, string>(
    existingRows.map((r) => [r.cnpj, r.current_status]),
  );

  // Check stale or unknown CNPJs first
  const staleThreshold = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const staleCnpjs = await prisma.$queryRawUnsafe<any[]>(
    `SELECT cnpj FROM cnpj_cache WHERE fetched_at < $1::timestamptz`,
    staleThreshold,
  );
  const staleSet = new Set(staleCnpjs.map((r: any) => r.cnpj));

  // Prioritize stale + unknown
  const toCheck = contacts.filter((c) => staleSet.has(c.cnpj) || !knownStatus.has(c.cnpj));
  const batch = toCheck.slice(0, batchSize);

  let checked = 0;
  let changed = 0;
  let errors = 0;

  for (const contact of batch) {
    try {
      const result = await lookupCnpj(contact.cnpj);
      const newStatus = result?.situacaoCadastral || result?.descSituacao || 'DESCONHECIDO';
      const prevStatus = knownStatus.get(contact.cnpj) || null;
      const statusChanged = prevStatus !== null && prevStatus !== newStatus;

      await prisma.$executeRawUnsafe(
        `INSERT INTO cnpj_monitoring (id, company_id, cnpj, contact_name, previous_status, current_status, changed_at, checked_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
         ON CONFLICT (company_id, cnpj) DO UPDATE SET
           contact_name = COALESCE(EXCLUDED.contact_name, cnpj_monitoring.contact_name),
           previous_status = cnpj_monitoring.current_status,
           current_status = EXCLUDED.current_status,
           changed_at = CASE WHEN cnpj_monitoring.current_status != EXCLUDED.current_status THEN NOW() ELSE cnpj_monitoring.changed_at END,
           checked_at = NOW()`,
        randomUUID(),
        companyId,
        contact.cnpj,
        contact.name,
        prevStatus,
        newStatus,
        statusChanged ? new Date() : null,
      );

      checked++;
      if (statusChanged) changed++;

      if (batch.indexOf(contact) < batch.length - 1) {
        await sleep(delayMs);
      }
    } catch (err) {
      log.error({ err, cnpj: contact.cnpj }, 'Error checking CNPJ');
      errors++;
    }
  }

  return { checked, changed, errors };
}

/**
 * Get recent CNPJ status changes (last 30 days).
 */
export async function getRecentCnpjChanges(
  companyId: string,
  limit = 50,
): Promise<Array<{
  cnpj: string;
  name: string | null;
  previousStatus: string | null;
  currentStatus: string;
  changedAt: Date;
}>> {
  await ensureCnpjMonitoringTable();

  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT cnpj, contact_name, previous_status, current_status, changed_at
     FROM cnpj_monitoring
     WHERE company_id = $1
       AND changed_at IS NOT NULL
       AND changed_at > NOW() - INTERVAL '30 days'
     ORDER BY changed_at DESC
     LIMIT $2`,
    companyId,
    limit,
  );

  return rows.map((r) => ({
    cnpj: r.cnpj,
    name: r.contact_name,
    previousStatus: r.previous_status,
    currentStatus: r.current_status,
    changedAt: new Date(r.changed_at),
  }));
}
