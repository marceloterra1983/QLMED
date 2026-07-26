import { randomUUID } from 'crypto';
import prisma from '@/lib/prisma';
import { lookupCnpj } from '@/lib/cnpj-lookup';
import { createLogger } from '@/lib/logger';

const log = createLogger('cnpj-monitor');

// cnpj_monitoring is schema-owned (Phase 11 baseline). No CREATE/ALTER at runtime.

export async function ensureCnpjMonitoringTable(): Promise<void> {
  return;
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
  // `not: ''` also drops NULL in SQL three-valued logic (NULL <> '' is unknown).
  const senders = await prisma.invoice.findMany({
    where: {
      companyId,
      senderCnpj: { not: '' },
    },
    select: { senderCnpj: true, senderName: true },
    distinct: ['senderCnpj'],
  });
  const recipients = await prisma.invoice.findMany({
    where: {
      companyId,
      recipientCnpj: { not: '' },
    },
    select: { recipientCnpj: true, recipientName: true },
    distinct: ['recipientCnpj'],
  });

  const byCnpj = new Map<string, string>();
  for (const r of senders) {
    const cnpj = (r.senderCnpj || '').replace(/\D/g, '');
    if (cnpj.length === 14 && !byCnpj.has(cnpj)) {
      byCnpj.set(cnpj, r.senderName || '');
    }
  }
  for (const r of recipients) {
    const cnpj = (r.recipientCnpj || '').replace(/\D/g, '');
    if (cnpj.length === 14 && !byCnpj.has(cnpj)) {
      byCnpj.set(cnpj, r.recipientName || '');
    }
  }

  const contacts = Array.from(byCnpj.entries()).map(([cnpj, name]) => ({ cnpj, name }));

  const existingRows = await prisma.cnpjMonitoring.findMany({
    where: { companyId },
    select: { cnpj: true, currentStatus: true },
  });
  const knownStatus = new Map<string, string | null>(
    existingRows.map((r) => [r.cnpj, r.currentStatus]),
  );

  const staleThreshold = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const staleCnpjs = await prisma.cnpjCache.findMany({
    where: { fetchedAt: { lt: staleThreshold } },
    select: { cnpj: true },
  });
  const staleSet = new Set(staleCnpjs.map((r) => r.cnpj));

  const toCheck = contacts.filter((c) => staleSet.has(c.cnpj) || !knownStatus.has(c.cnpj));
  const batch = toCheck.slice(0, batchSize);

  let checked = 0;
  let changed = 0;
  let errors = 0;

  for (const contact of batch) {
    try {
      const result = await lookupCnpj(contact.cnpj);
      const newStatus = result?.situacaoCadastral || result?.descSituacao || 'DESCONHECIDO';
      const prevStatus = knownStatus.get(contact.cnpj) ?? null;
      const statusChanged = prevStatus !== null && prevStatus !== newStatus;
      const now = new Date();

      const existing = await prisma.cnpjMonitoring.findUnique({
        where: {
          companyId_cnpj: { companyId, cnpj: contact.cnpj },
        },
      });

      if (existing) {
        const statusNowChanged = existing.currentStatus !== newStatus;
        await prisma.cnpjMonitoring.update({
          where: { id: existing.id },
          data: {
            contactName: contact.name || existing.contactName,
            previousStatus: existing.currentStatus,
            currentStatus: newStatus,
            changedAt: statusNowChanged ? now : existing.changedAt,
            checkedAt: now,
          },
        });
        if (statusNowChanged) changed++;
      } else {
        await prisma.cnpjMonitoring.create({
          data: {
            id: randomUUID(),
            companyId,
            cnpj: contact.cnpj,
            contactName: contact.name,
            previousStatus: prevStatus,
            currentStatus: newStatus,
            changedAt: statusChanged ? now : null,
            checkedAt: now,
          },
        });
        if (statusChanged) changed++;
      }

      checked++;

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
): Promise<
  Array<{
    cnpj: string;
    name: string | null;
    previousStatus: string | null;
    currentStatus: string;
    changedAt: Date;
  }>
> {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const rows = await prisma.cnpjMonitoring.findMany({
    where: {
      companyId,
      changedAt: { not: null, gt: since },
    },
    orderBy: { changedAt: 'desc' },
    take: limit,
  });

  return rows.map((r) => ({
    cnpj: r.cnpj,
    name: r.contactName,
    previousStatus: r.previousStatus,
    currentStatus: r.currentStatus || '',
    changedAt: r.changedAt ?? new Date(0),
  }));
}
