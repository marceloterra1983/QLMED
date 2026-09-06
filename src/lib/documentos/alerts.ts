import type { CompanyDocumentKind } from '@prisma/client';
import prisma from '@/lib/prisma';
import { createLogger } from '@/lib/logger';
import { getConfiguredWhatsAppGroup } from '@/lib/notification-outbox';
import {
  getEvolutionConfig,
  type EvolutionConfig,
} from '@/lib/whatsapp-evolution';
import {
  resolveOperatorWhatsAppTarget,
  type OperatorWhatsAppPort,
  type OperatorWhatsAppTarget,
} from '@/lib/operator-whatsapp-notify';
import {
  markBackgroundServiceError,
  markBackgroundServiceHeartbeat,
  markBackgroundServiceStarted,
} from '@/lib/background-service-health';
import { acquirePostgresAdvisoryLock, documentosAlertLockKey } from '@/lib/postgres-advisory-lock';
import { getSingleCompany } from '@/lib/single-company';
import { cartaLabelFromFileName } from './classify';
import {
  documentosAlertHourLocal,
  DOCUMENTOS_ALERT_TICK_MS,
  DOCUMENTOS_FAMILIES,
  familyForKind,
  getDocumentosWhatsAppGroupRaw,
  isDocumentosWhatsAppEnabled,
  kindExpires,
  labelForKind,
} from './constants';
import type { DocumentosFamily } from './families';
import {
  daysRemaining,
  selectVigente,
  thresholdDue,
  todayInSaoPaulo,
  toYmd,
} from './validity';
import { createDocumentosFolderPort } from './onedrive-port';
import {
  sanitizeError,
  type DocumentosFolderPort,
  type RenewalEvent,
} from './ingest';

const log = createLogger('documentos/alerts');
const SAO_PAULO = 'America/Sao_Paulo';

export type DocumentosWhatsAppPort = OperatorWhatsAppPort;
export type DocumentosWhatsAppTarget = OperatorWhatsAppTarget;

type AlertDoc = {
  id: string;
  kind: CompanyDocumentKind;
  category?: string | null;
  fileName: string;
  oneDriveItemId: string;
  validUntil: Date | string | null;
  removedAt: Date | string | null;
  alertedThresholds: number[];
  renewalNotifiedAt: Date | null;
};

type AlertPrisma = {
  companyDocument: {
    findMany: (args: unknown) => Promise<AlertDoc[]>;
    findUnique: (args: unknown) => Promise<AlertDoc | null>;
    update: (args: unknown) => Promise<unknown>;
  };
  companyDocumentIngestState: {
    findUnique: (args: unknown) => Promise<{ lastAlertDay: string | null } | null>;
    upsert: (args: unknown) => Promise<unknown>;
  };
};

export type DocumentosAlertDeps = {
  port?: DocumentosFolderPort;
  target?: DocumentosWhatsAppTarget | null;
  prisma?: AlertPrisma;
};

/**
 * Só existe destino quando o recurso está ligado, o grupo é um JID `@g.us` e as
 * credenciais Evolution estão no ambiente. Faltando qualquer peça o canal fica
 * silencioso, sem erro e sem cair no grupo fiscal (SPEC-042 FR-012).
 */
export function resolveDocumentosWhatsAppTarget(
  config?: EvolutionConfig | null,
): DocumentosWhatsAppTarget | null {
  return resolveOperatorWhatsAppTarget({
    isEnabled: isDocumentosWhatsAppEnabled(),
    groupRaw: getDocumentosWhatsAppGroupRaw(),
    config: config === undefined ? getEvolutionConfig() : config,
  });
}

function prazoPhrase(days: number): string {
  if (days > 0) return `vence em ${days} dias`;
  if (days === 0) return 'vence hoje';
  return `vencida há ${-days} dias`;
}

function formatBrDate(ymd: string): string {
  const [year, month, day] = ymd.split('-');
  return `${day}/${month}/${year}`;
}

/**
 * Legenda do aviso de validade: tipo, arquivo e prazo. Sem dado sensível.
 *
 * Tipos sem documento NÃO geram mensagem própria — a Evolution só envia
 * documento e não há PDF; a ausência já está visível na página e um aviso
 * diário de "nada a relatar" é ruído. Só entram na legenda da primeira
 * mensagem do dia, se houver alguma.
 */
export function buildExpiryCaption(
  row: { kind: CompanyDocumentKind; fileName: string },
  days: number,
  missingKindLabels: readonly string[] = [],
): string {
  const lines = [captionLabel(row), row.fileName, prazoPhrase(days)];
  for (const label of missingKindLabels) {
    lines.push(label);
  }
  return lines.join('\n');
}

export function buildRenewalCaption(
  row: { kind: CompanyDocumentKind; fileName: string },
  validUntilYmd: string,
): string {
  return [
    captionLabel(row),
    row.fileName,
    `renovada — válida até ${formatBrDate(validUntilYmd)}`,
  ].join('\n');
}

function captionLabel(row: { kind: CompanyDocumentKind; fileName: string }): string {
  const family = familyForKind(row.kind);
  if (family?.mode === 'open') return cartaLabelFromFileName(row.fileName);
  return labelForKind(row.kind);
}

function missingPhrase(family: DocumentosFamily, label: string): string {
  if (family.category === 'certidao') return `Sem certidão no OneDrive: ${label}`;
  return `Sem documento no OneDrive: ${label}`;
}

function hourInSaoPaulo(now: Date): number {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: SAO_PAULO,
    hour: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const raw = Number(parts.find((part) => part.type === 'hour')?.value || '0');
  return raw === 24 ? 0 : raw;
}

function resolveTarget(deps?: DocumentosAlertDeps): DocumentosWhatsAppTarget | null {
  if (deps && 'target' in deps) return deps.target ?? null;
  return resolveDocumentosWhatsAppTarget();
}

function dbOf(deps?: DocumentosAlertDeps): AlertPrisma {
  return deps?.prisma ?? (prisma as unknown as AlertPrisma);
}

async function markLastAlertDay(db: AlertPrisma, companyId: string, today: string): Promise<void> {
  await db.companyDocumentIngestState.upsert({
    where: { companyId },
    create: { companyId, lastAlertDay: today },
    update: { lastAlertDay: today },
  });
}

async function saveAlertError(
  db: AlertPrisma,
  companyId: string,
  now: Date,
  error: unknown,
): Promise<void> {
  const lastError = sanitizeError(error instanceof Error ? error.message : 'alerta falhou');
  await db.companyDocumentIngestState.upsert({
    where: { companyId },
    create: { companyId, lastError, lastErrorAt: now },
    update: { lastError, lastErrorAt: now },
  });
}

export async function runDocumentosAlertTick(
  companyId: string,
  deps?: DocumentosAlertDeps,
  now: Date = new Date(),
): Promise<{ sent: number; markedDay: boolean }> {
  const lock = await acquirePostgresAdvisoryLock(documentosAlertLockKey(companyId));
  if (!lock) return { sent: 0, markedDay: false };

  try {
    return await runDocumentosAlertTickLocked(companyId, deps, now);
  } finally {
    await lock.release();
  }
}

async function runDocumentosAlertTickLocked(
  companyId: string,
  deps: DocumentosAlertDeps | undefined,
  now: Date,
): Promise<{ sent: number; markedDay: boolean }> {
  const db = dbOf(deps);
  const today = todayInSaoPaulo(now);

  const state = await db.companyDocumentIngestState.findUnique({
    where: { companyId },
    select: { lastAlertDay: true },
  });
  if (state?.lastAlertDay === today) return { sent: 0, markedDay: true };

  if (hourInSaoPaulo(now) !== documentosAlertHourLocal()) return { sent: 0, markedDay: false };

  const target = resolveTarget(deps);
  if (!target) return { sent: 0, markedDay: false };

  const rows = await db.companyDocument.findMany({
    where: { companyId, removedAt: null },
    select: {
      id: true,
      kind: true,
      category: true,
      fileName: true,
      oneDriveItemId: true,
      validUntil: true,
      removedAt: true,
      alertedThresholds: true,
    },
  });

  const vigente = selectVigente(rows);
  const missingKindLabels: string[] = [];
  const due: { row: AlertDoc; days: number; threshold: number }[] = [];

  for (const family of DOCUMENTOS_FAMILIES) {
    if (family.mode === 'closed') {
      for (const kindDef of family.kinds) {
        const row = vigente.get(kindDef.kind);
        if (!row) {
          if (family.category === 'certidao') {
            missingKindLabels.push(missingPhrase(family, kindDef.label));
          }
          continue;
        }
        if (!kindDef.expira) continue;
        const ymd = toYmd(row.validUntil);
        if (!ymd) continue;
        const days = daysRemaining(today, ymd);
        const threshold = thresholdDue(days, row.alertedThresholds ?? [], family.thresholds);
        if (threshold != null) due.push({ row, days, threshold });
      }
      continue;
    }

    const ofFamily = rows.filter((row) => family.kinds.some((kind) => kind.kind === row.kind));
    for (const row of ofFamily) {
      if (!kindExpires(row.kind)) continue;
      const ymd = toYmd(row.validUntil);
      if (!ymd) continue;
      const days = daysRemaining(today, ymd);
      const threshold = thresholdDue(days, row.alertedThresholds ?? [], family.thresholds);
      if (threshold != null) due.push({ row, days, threshold });
    }
  }

  // Grave lastAlertDay ANTES de enviar. O dia é a mesma classe de estado que
  // o limiar (JOB-005): dois ticks sobrepostos não podem ambos passar. O
  // advisory lock serializa a corrida; esta escrita fecha a janela se o lock
  // falhar. Um envio falhado com o dia já marcado perde o ciclo (fica no log),
  // em vez de duplicar.
  await markLastAlertDay(db, companyId, today);

  const port = deps?.port ?? (await createDocumentosFolderPort(companyId));
  let sent = 0;
  let captionExtras = missingKindLabels;

  for (const item of due) {
    let content: Buffer;
    try {
      content = await port.downloadPdf(item.row.oneDriveItemId);
    } catch (error) {
      log.warn(
        {
          documentId: item.row.id,
          kind: item.row.kind,
          err: sanitizeError(error instanceof Error ? error.message : 'download'),
        },
        'documentos_alert_download_failed',
      );
      await saveAlertError(db, companyId, now, error);
      continue;
    }

    // JOB-005 / outbox fiscal: grave o limiar em alertedThresholds ANTES de
    // chamar a Evolution. Um reinício entre o envio e a escrita duplicaria o
    // aviso; um envio falhado com o limiar já consumido só perde UM aviso e
    // fica no log.
    const nextThresholds = [...(item.row.alertedThresholds ?? []), item.threshold];
    await db.companyDocument.update({
      where: { id: item.row.id },
      data: { alertedThresholds: nextThresholds },
    });
    item.row.alertedThresholds = nextThresholds;

    const caption = buildExpiryCaption(item.row, item.days, captionExtras);

    try {
      await target.port.sendDocument({
        jid: target.jid,
        fileName: item.row.fileName,
        content,
        caption,
      });
      sent += 1;
      captionExtras = [];
      log.info(
        { documentId: item.row.id, kind: item.row.kind, threshold: item.threshold },
        'documentos_alert_sent',
      );
    } catch (error) {
      log.warn(
        {
          documentId: item.row.id,
          kind: item.row.kind,
          threshold: item.threshold,
          err: sanitizeError(error instanceof Error ? error.message : 'envio'),
        },
        'documentos_alert_failed',
      );
      await saveAlertError(db, companyId, now, error);
    }
  }

  return { sent, markedDay: true };
}

/**
 * Para cada renovação, grave `renewalNotifiedAt` ANTES de enviar (mesma razão
 * do limiar / JOB-005). Reexecução não reenvia.
 */
export async function notifyRenewals(
  events: RenewalEvent[],
  deps?: DocumentosAlertDeps,
): Promise<void> {
  if (events.length === 0) return;
  const target = resolveTarget(deps);
  if (!target) return;

  const db = dbOf(deps);
  const port = deps?.port ?? (await createDocumentosFolderPort(events[0].companyId));

  for (const event of events) {
    const row = await db.companyDocument.findUnique({
      where: { id: event.documentId },
      select: {
        id: true,
        kind: true,
        fileName: true,
        oneDriveItemId: true,
        validUntil: true,
        renewalNotifiedAt: true,
      },
    });
    if (!row || row.renewalNotifiedAt) continue;

    let content: Buffer;
    try {
      content = await port.downloadPdf(row.oneDriveItemId);
    } catch (error) {
      log.warn(
        {
          documentId: row.id,
          kind: row.kind,
          err: sanitizeError(error instanceof Error ? error.message : 'download'),
        },
        'documentos_renewal_download_failed',
      );
      continue;
    }

    // JOB-005: grave renewalNotifiedAt ANTES de chamar a Evolution.
    // Um reinício entre o envio e a escrita duplicaria o aviso.
    await db.companyDocument.update({
      where: { id: row.id },
      data: { renewalNotifiedAt: new Date() },
    });
    row.renewalNotifiedAt = new Date();

    try {
      await target.port.sendDocument({
        jid: target.jid,
        fileName: row.fileName,
        content,
        caption: buildRenewalCaption(row, event.validUntil),
      });
      log.info({ documentId: row.id, kind: event.kind }, 'documentos_renewal_sent');
    } catch (error) {
      log.warn(
        {
          documentId: row.id,
          kind: event.kind,
          err: sanitizeError(error instanceof Error ? error.message : 'envio'),
        },
        'documentos_renewal_failed',
      );
    }
  }
}

/** Registrado no bootstrap pela L7; respeita QLMED_DISABLE_BACKGROUND_SERVICES. */
export function startDocumentosAlert(): void {
  const disabled = process.env.QLMED_DISABLE_BACKGROUND_SERVICES === 'true';
  markBackgroundServiceStarted('documentos-alert', {
    enabled: !disabled,
    heartbeatIntervalMs: DOCUMENTOS_ALERT_TICK_MS,
  });
  if (disabled) return;

  let lastSlotKey: string | null = null;

  const tick = async () => {
    markBackgroundServiceHeartbeat('documentos-alert');
    try {
      const now = new Date();
      const hora = documentosAlertHourLocal();
      if (hourInSaoPaulo(now) !== hora) return;
      const slotKey = `${todayInSaoPaulo(now)} ${String(hora).padStart(2, '0')}`;
      if (lastSlotKey === slotKey) return;

      const company = await getSingleCompany();
      if (!company) return;
      const result = await runDocumentosAlertTick(company.id, undefined, now);
      if (result.markedDay) lastSlotKey = slotKey;
    } catch (error) {
      markBackgroundServiceError('documentos-alert', error);
      log.error(
        {
          err: sanitizeError(error instanceof Error ? error.message : 'alert'),
          stack: sanitizeError(
            String(error && (error as { stack?: string }).stack ? (error as { stack?: string }).stack : ''),
          ),
        },
        'documentos_alert_tick_failed',
      );
    }
  };

  setTimeout(() => {
    void tick();
    setInterval(() => {
      void tick();
    }, DOCUMENTOS_ALERT_TICK_MS);
  }, 8_000);
}
