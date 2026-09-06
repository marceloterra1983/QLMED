import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import prisma from '@/lib/prisma';
import { createLogger } from '@/lib/logger';
import { getSingleCompany } from '@/lib/single-company';
import { getConfiguredWhatsAppGroup } from '@/lib/notification-outbox';
import { getEvolutionConfig, sendWhatsAppText } from '@/lib/whatsapp-evolution';
import {
  acquirePostgresAdvisoryLock,
  acquirePostgresTransactionAdvisoryLock,
} from '@/lib/postgres-advisory-lock';
import {
  buildDailyIssuedSummaryMessages,
  campoGrandeDayUtcBounds,
  getCampoGrandeDateParts,
  type DailySummaryMessage,
} from '@/lib/daily-issued-summary-message';
import {
  markBackgroundServiceHeartbeat,
  markBackgroundServiceStarted,
} from '@/lib/background-service-health';

const log = createLogger('daily-issued-summary');

const TICK_MS = 60_000;
const LOCK_KEY = 'daily-issued-summary';
const PROD_APP_ORIGIN = 'https://app.qlmed.com.br';

let lastSentDate: string | null = null;

function stateDir(): string {
  return process.env.DAILY_SUMMARY_STATE_DIR || '/app/storage/qlmed-daily-summary';
}

function sentMarkerPath(dateISO: string): string {
  return join(stateDir(), `sent_${dateISO}`);
}

function statusPath(): string {
  return join(stateDir(), 'status');
}

export function readSentDateFromDisk(dateISO: string): boolean {
  try {
    if (existsSync(sentMarkerPath(dateISO))) return true;
    if (!existsSync(statusPath())) return false;
    const body = readFileSync(statusPath(), 'utf8');
    const m = body.match(/^sent_date=(.+)$/m);
    return m?.[1]?.trim() === dateISO;
  } catch {
    return false;
  }
}

export function markSentOnDisk(dateISO: string): void {
  lastSentDate = dateISO;
  try {
    mkdirSync(stateDir(), { recursive: true, mode: 0o700 });
    writeFileSync(sentMarkerPath(dateISO), `${dateISO}\n`, { mode: 0o600 });
    writeFileSync(
      statusPath(),
      `sent_date=${dateISO}\nchecked_at=${new Date().toISOString()}\nresult=ok\n`,
      { mode: 0o600 },
    );
  } catch (err) {
    log.warn({ err }, 'daily_summary_state_write_failed');
  }
}

export function wasAlreadySentOnDisk(dateISO: string): boolean {
  if (lastSentDate === dateISO) return true;
  if (readSentDateFromDisk(dateISO)) {
    lastSentDate = dateISO;
    return true;
  }
  return false;
}

/**
 * Consulta de envio canônica: verifica claim no Postgres primeiro, com
 * fallback gracioso para cache de disco e memória.
 */
export async function isDailySummarySent(dateISO: string): Promise<boolean> {
  if (lastSentDate === dateISO) return true;
  try {
    if (await hasDbSentClaim(dateISO)) {
      lastSentDate = dateISO;
      return true;
    }
  } catch {
    // fallback para disco em caso de falha de conexão com o banco
  }
  return wasAlreadySentOnDisk(dateISO);
}

/** @deprecated use isDailySummarySent ou wasAlreadySentOnDisk — mantido para compatibilidade */
export function wasAlreadySent(dateISO: string): boolean {
  return wasAlreadySentOnDisk(dateISO);
}

/** Test helper — reset in-process idempotency. */
export function __resetDailySummarySentMemory(): void {
  lastSentDate = null;
}

/**
 * Só produção pública pode enviar WhatsApp do resumo.
 * Preview (:3002) e dev herdam Evolution de app.env — sem este gate, duplicam.
 * Override explícito: DAILY_SUMMARY_ALLOW_SEND=1|0.
 */
export function isDailySummarySenderAllowed(): boolean {
  const allow = (process.env.DAILY_SUMMARY_ALLOW_SEND ?? '').trim();
  if (allow === '0') return false;
  if (allow === '1') return true;
  const base = (process.env.NEXTAUTH_URL || process.env.QLMED_APP_URL || '')
    .trim()
    .replace(/\/+$/, '')
    .toLowerCase();
  return base === PROD_APP_ORIGIN;
}

function resolveRecipients(): string[] {
  const override = (process.env.DAILY_SUMMARY_WHATSAPP_GROUP_JID ?? '').trim();
  if (override.endsWith('@g.us')) return [override];
  const configured = getConfiguredWhatsAppGroup();
  return configured ? [configured] : [];
}

function isNativeEnabled(): boolean {
  return (process.env.DAILY_SUMMARY_NATIVE ?? '1') !== '0';
}

function isDryRunEnv(): boolean {
  return process.env.DAILY_SUMMARY_DRY_RUN === '1';
}

export type DailyIssuedSummaryResult = {
  status: 'sent' | 'dry_run' | 'skipped' | 'already_sent' | 'disabled' | 'error';
  date: string;
  messages: DailySummaryMessage[];
  sent: number;
  reason?: string;
};

export async function hasDbSentClaim(dateISO: string): Promise<boolean> {
  const row = await prisma.dailyIssuedSummarySend.findUnique({
    where: { dateISO },
    select: { sentAt: true },
  });
  return Boolean(row?.sentAt);
}

/**
 * Claim atómico: só um processo no cluster (prod+preview+catch-up) ganha o dia.
 * Retorna false se já existir claim (enviado ou em curso).
 */
export async function tryClaimDailySummarySend(
  dateISO: string,
  source: string,
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    await acquirePostgresTransactionAdvisoryLock(tx, `${LOCK_KEY}:${dateISO}`);
    const existing = await tx.dailyIssuedSummarySend.findUnique({
      where: { dateISO },
      select: { dateISO: true },
    });
    if (existing) return false;
    await tx.dailyIssuedSummarySend.create({
      data: { dateISO, source, claimedAt: new Date() },
    });
    return true;
  });
}

export async function markDbSent(dateISO: string): Promise<void> {
  await prisma.dailyIssuedSummarySend.update({
    where: { dateISO },
    data: { sentAt: new Date() },
  });
}

export async function releaseDbClaim(dateISO: string): Promise<void> {
  await prisma.dailyIssuedSummarySend.deleteMany({
    where: { dateISO, sentAt: null },
  });
}

export async function runDailyIssuedSummary(options?: {
  now?: Date;
  dryRun?: boolean;
}): Promise<DailyIssuedSummaryResult> {
  const now = options?.now ?? new Date();
  const { dateISO, dateBR } = getCampoGrandeDateParts(now);
  const dryRun = options?.dryRun === true || isDryRunEnv();

  if (!isNativeEnabled()) {
    return { status: 'disabled', date: dateISO, messages: [], sent: 0, reason: 'DAILY_SUMMARY_NATIVE=0' };
  }

  if (!dryRun && !isDailySummarySenderAllowed()) {
    log.warn(
      { nextAuthUrl: process.env.NEXTAUTH_URL, date: dateISO },
      'daily_summary_sender_refused',
    );
    return {
      status: 'skipped',
      date: dateISO,
      messages: [],
      sent: 0,
      reason: 'sender-not-production',
    };
  }

  if (!dryRun && (await isDailySummarySent(dateISO))) {
    return { status: 'already_sent', date: dateISO, messages: [], sent: 0, reason: 'idempotent' };
  }

  const company = await getSingleCompany();
  if (!company) {
    return { status: 'skipped', date: dateISO, messages: [], sent: 0, reason: 'company-missing' };
  }

  const recipients = resolveRecipients();
  if (recipients.length === 0) {
    return {
      status: 'skipped',
      date: dateISO,
      messages: [],
      sent: 0,
      reason: 'whatsapp-group-unconfigured',
    };
  }

  const { start, end } = campoGrandeDayUtcBounds(dateISO);
  const invoices = await prisma.invoice.findMany({
    where: {
      companyId: company.id,
      direction: 'issued',
      issueDate: { gte: start, lt: end },
    },
    select: {
      number: true,
      totalValue: true,
      cfop: true,
      cancelledAt: true,
      recipientCnpj: true,
      recipientName: true,
    },
    orderBy: [{ issueDate: 'asc' }, { number: 'asc' }],
  });

  const nickRows = await prisma.contactNickname.findMany({
    where: { companyId: company.id },
    select: { cnpj: true, shortName: true },
  });
  const nicknames: Record<string, string> = {};
  for (const row of nickRows) nicknames[row.cnpj] = row.shortName;

  const appBaseUrl = (process.env.NEXTAUTH_URL || process.env.QLMED_APP_URL || PROD_APP_ORIGIN).replace(
    /\/+$/,
    '',
  );

  const messages = buildDailyIssuedSummaryMessages({
    invoices: invoices.map((inv) => ({
      number: inv.number,
      totalValue: inv.totalValue == null ? 0 : Number(inv.totalValue),
      cfop: inv.cfop,
      cancelledAt: inv.cancelledAt,
      recipientCnpj: inv.recipientCnpj,
      recipientName: inv.recipientName,
    })),
    nicknames,
    now,
    appBaseUrl,
    recipients,
  });

  if (dryRun) {
    log.info({ date: dateISO, dateBR, count: messages.length }, 'daily_summary_dry_run');
    return { status: 'dry_run', date: dateISO, messages, sent: 0, reason: 'dry-run' };
  }

  const config = getEvolutionConfig();
  if (!config) {
    return {
      status: 'skipped',
      date: dateISO,
      messages,
      sent: 0,
      reason: 'evolution-unconfigured',
    };
  }

  let lock: Awaited<ReturnType<typeof acquirePostgresAdvisoryLock>> = null;
  try {
    lock = await acquirePostgresAdvisoryLock(LOCK_KEY, { wait: false });
  } catch (err) {
    log.warn({ err }, 'daily_summary_lock_unavailable');
    return {
      status: 'skipped',
      date: dateISO,
      messages,
      sent: 0,
      reason: 'lock_unavailable',
    };
  }

  if (!lock) {
    return {
      status: 'skipped',
      date: dateISO,
      messages,
      sent: 0,
      reason: 'lock_not_acquired',
    };
  }

  let claimed = false;
  let sent = 0;
  try {
    if (wasAlreadySentOnDisk(dateISO) || (await hasDbSentClaim(dateISO))) {
      markSentOnDisk(dateISO);
      return { status: 'already_sent', date: dateISO, messages: [], sent: 0, reason: 'idempotent' };
    }

    claimed = await tryClaimDailySummarySend(dateISO, 'native');
    if (!claimed) {
      markSentOnDisk(dateISO);
      return { status: 'already_sent', date: dateISO, messages: [], sent: 0, reason: 'claim-lost' };
    }

    for (const msg of messages) {
      await sendWhatsAppText({ jid: msg.jid, text: msg.text }, config);
      sent += 1;
    }
    await markDbSent(dateISO);
    markSentOnDisk(dateISO);
    log.info({ date: dateISO, sent }, 'daily_summary_sent');
    return { status: 'sent', date: dateISO, messages, sent };
  } catch (err) {
    if (claimed && sent === 0) {
      await releaseDbClaim(dateISO).catch((releaseErr) => {
        log.warn({ err: releaseErr, date: dateISO }, 'daily_summary_claim_release_failed');
      });
    } else if (claimed && sent > 0) {
      await markDbSent(dateISO).catch(() => undefined);
      markSentOnDisk(dateISO);
      log.warn({ date: dateISO, sent }, 'daily_summary_partial_send_claim_preserved');
    }
    log.error({ err, date: dateISO }, 'daily_summary_send_failed');
    return {
      status: 'error',
      date: dateISO,
      messages,
      sent,
      reason: err instanceof Error ? err.message : 'send-failed',
    };
  } finally {
    if (lock && typeof (lock as { release?: () => Promise<void> }).release === 'function') {
      await (lock as { release: () => Promise<void> }).release().catch(() => undefined);
    }
  }
}

export function startDailyIssuedSummary(): void {
  const disabled =
    process.env.QLMED_DISABLE_BACKGROUND_SERVICES === 'true' ||
    !isNativeEnabled() ||
    !isDailySummarySenderAllowed();
  markBackgroundServiceStarted('daily-issued-summary', {
    enabled: !disabled,
    heartbeatIntervalMs: TICK_MS,
  });
  if (disabled) {
    if (!isDailySummarySenderAllowed()) {
      log.info({ nextAuthUrl: process.env.NEXTAUTH_URL }, 'daily_summary_tick_disabled_non_prod');
    }
    return;
  }

  const tick = async () => {
    markBackgroundServiceHeartbeat('daily-issued-summary');
    try {
      const now = new Date();
      const { dateISO, hour } = getCampoGrandeDateParts(now);
      // Após 18h CG: envia se ainda não mandou (cobre deploy/reboot depois do horário).
      if (hour < 18) return;
      if (wasAlreadySentOnDisk(dateISO)) return;
      try {
        if (await hasDbSentClaim(dateISO)) {
          markSentOnDisk(dateISO);
          return;
        }
      } catch {
        /* read fail → tenta run, que também checa */
      }
      await runDailyIssuedSummary({ now });
    } catch (err) {
      log.error({ err }, 'daily_summary_tick_failed');
    }
  };

  void tick();
  setInterval(() => {
    void tick();
  }, TICK_MS);
}
