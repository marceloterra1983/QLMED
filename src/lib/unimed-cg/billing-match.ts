import prisma from '@/lib/prisma';
import { createLogger } from '@/lib/logger';
import { foldName } from '@/lib/cte-whatsapp-caption';
import {
  UNIMED_CG_BILLING_RECIPIENT_CNPJ,
  type UnimedCgBilledMatchStatus,
} from './constants';

const log = createLogger('unimed-cg/billing-match');

export function digitsCnpj(value: string | null | undefined): string {
  return (value ?? '').replace(/\D/g, '');
}

export function isUnimedCgBillingRecipient(cnpj: string | null | undefined): boolean {
  return digitsCnpj(cnpj) === UNIMED_CG_BILLING_RECIPIENT_CNPJ;
}

/** Extrai texto de <infCpl>…</infCpl> do XML da NF-e (primeira ocorrência). */
export function extractInfCpl(xmlContent: string | null | undefined): string | null {
  if (!xmlContent) return null;
  const m = xmlContent.match(/<infCpl>([\s\S]*?)<\/infCpl>/i);
  if (!m) return null;
  return decodeXmlText(m[1]).trim() || null;
}

function decodeXmlText(raw: string): string {
  return raw
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

export function normalizeBillingName(value: string): string {
  return foldName(value);
}

/**
 * Nome completo (≥2 tokens após fold) deve aparecer como substring no infCpl
 * já normalizado.
 */
export function patientNameMatchesInfCpl(patientName: string, infCpl: string): boolean {
  const foldedName = normalizeBillingName(patientName);
  const tokens = foldedName.split(' ').filter(Boolean);
  if (tokens.length < 2) return false;
  const foldedCpl = normalizeBillingName(infCpl);
  return foldedCpl.includes(foldedName);
}

export type BillingInvoiceCandidate = {
  id: string;
  number: string;
  infCpl: string;
};

export type MatchDecision =
  | { status: 'matched'; invoice: BillingInvoiceCandidate }
  | { status: 'ambiguous'; invoices: BillingInvoiceCandidate[] }
  | { status: 'none' };

export function decideBillingMatches(
  patientName: string,
  invoices: BillingInvoiceCandidate[],
): MatchDecision {
  const hits = invoices.filter((inv) => patientNameMatchesInfCpl(patientName, inv.infCpl));
  if (hits.length === 0) return { status: 'none' };
  if (hits.length === 1) return { status: 'matched', invoice: hits[0]! };
  return { status: 'ambiguous', invoices: hits };
}

function infCplFromEmissionPayload(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const inf = (payload as { infCpl?: unknown }).infCpl;
  return typeof inf === 'string' && inf.trim() ? inf.trim() : null;
}

export type RunBillingMatchResult = {
  matched: number;
  ambiguous: number;
  skipped: number;
};

export type RunBillingMatchOptions = {
  /** Quando definido, prioriza/ restringe candidatos a esta Invoice. */
  invoiceId?: string;
};

/**
 * Cruza autorizações Unimed CG (com patientName) com NF-e emitidas ao CNPJ Unimed.
 * matched: grava vínculo; ambiguous: status sem invoiceId definitivo.
 * Já matched não são reprocessados.
 */
export async function runUnimedCgBillingMatch(
  companyId: string,
  options: RunBillingMatchOptions = {},
): Promise<RunBillingMatchResult> {
  const auths = await prisma.unimedCgAuthorization.findMany({
    where: {
      companyId,
      patientName: { not: null },
      OR: [{ billedMatchStatus: null }, { billedMatchStatus: 'ambiguous' }],
    },
    select: {
      id: true,
      processId: true,
      patientName: true,
      billedMatchStatus: true,
    },
  });

  const eligible = auths.filter((a) => {
    const name = a.patientName?.trim();
    if (!name) return false;
    const tokens = normalizeBillingName(name).split(' ').filter(Boolean);
    return tokens.length >= 2;
  });

  if (eligible.length === 0) {
    return { matched: 0, ambiguous: 0, skipped: auths.length };
  }

  const invoices = await loadUnimedIssuedInvoices(companyId, options.invoiceId);
  if (invoices.length === 0) {
    return { matched: 0, ambiguous: 0, skipped: eligible.length };
  }

  let matched = 0;
  let ambiguous = 0;
  let skipped = 0;
  const now = new Date();

  for (const auth of eligible) {
    const patientName = auth.patientName!.trim();
    const decision = decideBillingMatches(patientName, invoices);

    if (decision.status === 'none') {
      skipped += 1;
      continue;
    }

    if (decision.status === 'ambiguous') {
      await prisma.unimedCgAuthorization.update({
        where: { id: auth.id },
        data: {
          billedMatchStatus: 'ambiguous' satisfies UnimedCgBilledMatchStatus,
          billedInvoiceId: null,
          billedInvoiceNumber: null,
          billedMatchedAt: now,
        },
      });
      ambiguous += 1;
      log.info(
        { processId: auth.processId, hits: decision.invoices.map((i) => i.number) },
        'unimed_cg_billing_match_ambiguous',
      );
      continue;
    }

    await prisma.unimedCgAuthorization.update({
      where: { id: auth.id },
      data: {
        billedMatchStatus: 'matched' satisfies UnimedCgBilledMatchStatus,
        billedInvoiceId: decision.invoice.id,
        billedInvoiceNumber: decision.invoice.number,
        billedMatchedAt: now,
      },
    });
    matched += 1;
    log.info(
      {
        processId: auth.processId,
        invoiceId: decision.invoice.id,
        invoiceNumber: decision.invoice.number,
      },
      'unimed_cg_billing_match_ok',
    );
  }

  return { matched, ambiguous, skipped };
}

async function loadUnimedIssuedInvoices(
  companyId: string,
  invoiceId?: string,
): Promise<BillingInvoiceCandidate[]> {
  const rows = await prisma.invoice.findMany({
    where: {
      companyId,
      type: 'NFE',
      direction: 'issued',
      ...(invoiceId ? { id: invoiceId } : {}),
    },
    select: {
      id: true,
      number: true,
      recipientCnpj: true,
      xmlContent: true,
    },
    orderBy: { issueDate: 'desc' },
    take: invoiceId ? 1 : 500,
  });

  const filtered = rows.filter((r) => isUnimedCgBillingRecipient(r.recipientCnpj));
  const out: BillingInvoiceCandidate[] = [];

  for (const row of filtered) {
    let infCpl = extractInfCpl(row.xmlContent);
    if (!infCpl) {
      const emission = await prisma.invoiceEmission.findFirst({
        where: { companyId, invoiceId: row.id, status: 'authorized' },
        select: { payload: true },
      });
      infCpl = infCplFromEmissionPayload(emission?.payload) ?? null;
    }
    if (!infCpl) continue;
    out.push({ id: row.id, number: row.number, infCpl });
  }

  return out;
}

/**
 * Dispara match após emissão autorizada (fire-safe: erros só log).
 */
export async function maybeMatchAfterUnimedNfeIssued(input: {
  companyId: string;
  recipientCnpj: string | null | undefined;
  invoiceId: string;
}): Promise<void> {
  if (!isUnimedCgBillingRecipient(input.recipientCnpj)) return;
  try {
    // Match completo: filtrar só a NF nova ocultaria ambiguidade com outras NF-e.
    const result = await runUnimedCgBillingMatch(input.companyId);
    log.info(
      { invoiceId: input.invoiceId, ...result },
      'unimed_cg_billing_match_after_issue',
    );
  } catch (error) {
    log.error(
      { err: error instanceof Error ? error.message : 'match', invoiceId: input.invoiceId },
      'unimed_cg_billing_match_after_issue_failed',
    );
  }
}
