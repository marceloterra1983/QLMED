import type { CompanyDocumentKind } from '@prisma/client';
import { DOCUMENTOS_ALERT_THRESHOLDS, DOCUMENTOS_EXPIRED_REPEAT_DAYS } from './constants';

const SAO_PAULO = 'America/Sao_Paulo';
const MS_PER_DAY = 86_400_000;

/** dd.MM.yy, dd.MM.yyyy ou dd-MM-yyyy — grupos 1–3 (ponto) ou 4–6 (hífen). */
const DATE_IN_NAME =
  /(?<!\d)(\d{2})\.(\d{2})\.(\d{4}|\d{2})(?!\d)|(?<!\d)(\d{2})-(\d{2})-(\d{4})(?!\d)/g;

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function isValidCivilDate(year: number, month: number, day: number): boolean {
  const utc = new Date(Date.UTC(year, month - 1, day));
  return utc.getUTCFullYear() === year && utc.getUTCMonth() === month - 1 && utc.getUTCDate() === day;
}

/**
 * Validade lida do nome: a ÚLTIMA data `dd.MM.yy` / `dd.MM.yyyy` / `dd-MM-yyyy`.
 * `yy` vira `20yy`. Data civil inválida ou sem match → null.
 */
export function extractValidUntil(fileName: string): { date: string } | null {
  const normalized = fileName.normalize('NFC');
  const matches = [...normalized.matchAll(DATE_IN_NAME)];
  if (matches.length === 0) return null;
  const last = matches[matches.length - 1];
  const day = Number(last[1] ?? last[4]);
  const month = Number(last[2] ?? last[5]);
  const yearToken = last[3] ?? last[6] ?? '';
  const year = yearToken.length === 2 ? 2000 + Number(yearToken) : Number(yearToken);
  if (!isValidCivilDate(year, month, day)) return null;
  return { date: `${year}-${pad2(month)}-${pad2(day)}` };
}

function utcMidnight(ymd: string): number {
  const [year, month, day] = ymd.split('-').map(Number);
  return Date.UTC(year, month - 1, day);
}

/** Diferença em dias civis entre duas datas `YYYY-MM-DD` (UTC, sem DST). */
export function daysRemaining(todayLocal: string, validUntil: string): number {
  return Math.round((utcMidnight(validUntil) - utcMidnight(todayLocal)) / MS_PER_DAY);
}

export type DocumentStatusKey = 'ok' | 'atencao' | 'urgente' | 'hoje' | 'vencida' | 'sem_data';

export function statusFor(days: number | null): { key: DocumentStatusKey; label: string } {
  if (days === null) return { key: 'sem_data', label: 'sem data' };
  if (days > 30) return { key: 'ok', label: 'ok' };
  if (days >= 8) return { key: 'atencao', label: 'atenção' };
  if (days >= 1) return { key: 'urgente', label: 'urgente' };
  if (days === 0) return { key: 'hoje', label: 'vence hoje' };
  return { key: 'vencida', label: `vencida há ${-days} dias` };
}

function toYmd(value: Date | string | null): string | null {
  if (value == null) return null;
  if (typeof value === 'string') {
    const match = /^(\d{4}-\d{2}-\d{2})/.exec(value.trim());
    return match?.[1] ?? null;
  }
  if (Number.isNaN(value.getTime())) return null;
  return value.toISOString().slice(0, 10);
}

export type SelectVigenteRow = {
  kind: CompanyDocumentKind;
  validUntil: Date | string | null;
  removedAt: Date | string | null;
};

/** Por kind, a linha não removida de maior `validUntil`; null só ganha se for a única. */
export function selectVigente<T extends SelectVigenteRow>(rows: T[]): Map<CompanyDocumentKind, T> {
  const vigente = new Map<CompanyDocumentKind, T>();
  for (const row of rows) {
    if (row.removedAt != null) continue;
    const current = vigente.get(row.kind);
    if (!current) {
      vigente.set(row.kind, row);
      continue;
    }
    const currentDate = toYmd(current.validUntil);
    const nextDate = toYmd(row.validUntil);
    if (nextDate != null && (currentDate == null || nextDate > currentDate)) {
      vigente.set(row.kind, row);
    }
  }
  return vigente;
}

/**
 * Limiar de alerta ainda não marcado para `days` dias civis até a validade.
 *
 * Para `days >= 0`: candidato = o menor `t` em `DOCUMENTOS_ALERT_THRESHOLDS`
 * com `t >= days`. O aviso do limiar 30 sai no dia em que faltam 30 (ou
 * menos, se o job não rodou) e nunca se repete. Sem `t >= days` (ex.: 31) →
 * null. Se o candidato já está em `alerted` → null.
 *
 * Para `days < 0` (vencida): candidato = `-7 * ceil(-days / 7)`
 * (`-7`, `-14`, …; days -1..-7 → -7). Devolve-o se ainda não está em `alerted`.
 */
export function thresholdDue(days: number, alerted: readonly number[]): number | null {
  const candidate = days >= 0 ? upcomingThreshold(days) : expiredThreshold(days);
  if (candidate === null) return null;
  return alerted.includes(candidate) ? null : candidate;
}

function upcomingThreshold(days: number): number | null {
  let smallest: number | null = null;
  for (const t of DOCUMENTOS_ALERT_THRESHOLDS) {
    if (t >= days && (smallest === null || t < smallest)) smallest = t;
  }
  return smallest;
}

function expiredThreshold(days: number): number {
  return -DOCUMENTOS_EXPIRED_REPEAT_DAYS * Math.ceil(-days / DOCUMENTOS_EXPIRED_REPEAT_DAYS);
}

/** `YYYY-MM-DD` civil em America/Sao_Paulo (Intl; mesma ideia de `getDatePartsInTimeZone`). */
export function todayInSaoPaulo(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: SAO_PAULO,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}
