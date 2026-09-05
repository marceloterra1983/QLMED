import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import prisma from '@/lib/prisma';
import { createLogger } from '@/lib/logger';
import { getSingleCompany } from '@/lib/single-company';
import { getConfiguredWhatsAppGroup } from '@/lib/notification-outbox';
import { getEvolutionConfig, sendWhatsAppText } from '@/lib/whatsapp-evolution';
import { acquirePostgresAdvisoryLock } from '@/lib/postgres-advisory-lock';
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

let lastSentDate: string | null = null;

function stateDir(): string {
  return process.env.DAILY_SUMMARY_STATE_DIR || '/var/lib/qlmed-daily-summary-catchup';
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

export function wasAlreadySent(dateISO: string): boolean {
  if (lastSentDate === dateISO) return true;
  if (readSentDateFromDisk(dateISO)) {
    lastSentDate = dateISO;
    return true;
  }
  return false;
}

/** Test helper — reset in-process idempotency. */
export function __resetDailySummarySentMemory(): void {
  lastSentDate = null;
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

  if (wasAlreadySent(dateISO) && !dryRun) {
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

  const appBaseUrl = (process.env.NEXTAUTH_URL || process.env.QLMED_APP_URL || 'https://app.qlmed.com.br').replace(
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
  }

  try {
    if (wasAlreadySent(dateISO)) {
      return { status: 'already_sent', date: dateISO, messages: [], sent: 0, reason: 'idempotent' };
    }

    let sent = 0;
    for (const msg of messages) {
      await sendWhatsAppText({ jid: msg.jid, text: msg.text }, config);
      sent += 1;
    }
    markSentOnDisk(dateISO);
    log.info({ date: dateISO, sent }, 'daily_summary_sent');
    return { status: 'sent', date: dateISO, messages, sent };
  } catch (err) {
    log.error({ err, date: dateISO }, 'daily_summary_send_failed');
    return {
      status: 'error',
      date: dateISO,
      messages,
      sent: 0,
      reason: err instanceof Error ? err.message : 'send-failed',
    };
  } finally {
    if (lock && typeof (lock as { release?: () => Promise<void> }).release === 'function') {
      await (lock as { release: () => Promise<void> }).release().catch(() => undefined);
    }
  }
}

export function startDailyIssuedSummary(): void {
  const disabled = process.env.QLMED_DISABLE_BACKGROUND_SERVICES === 'true' || !isNativeEnabled();
  markBackgroundServiceStarted('daily-issued-summary', {
    enabled: !disabled,
    heartbeatIntervalMs: TICK_MS,
  });
  if (disabled) return;

  const tick = async () => {
    markBackgroundServiceHeartbeat('daily-issued-summary');
    try {
      const now = new Date();
      const { dateISO, hour } = getCampoGrandeDateParts(now);
      if (hour !== 18) return;
      if (wasAlreadySent(dateISO)) return;
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
