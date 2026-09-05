import { createLogger } from '@/lib/logger';
import {
  UNIMED_CG_OPME_HOSTS,
  UNIMED_CG_PARSE_RANK,
  UNIMED_CG_SUBJECT_RE,
  type UnimedCgParseStatus,
} from './constants';

const log = createLogger('unimed-cg/parse');

export type ParsedUnimedCgPage = {
  processId: string;
  authorizationNumber: string | null;
  procedureDate: Date | null;
  location: string | null;
  totalCents: number | null;
  parseStatus: UnimedCgParseStatus;
};

export function extractProcessIdFromSubject(subject: string): string | null {
  const match = UNIMED_CG_SUBJECT_RE.exec(subject);
  return match?.[1] ?? null;
}

export function isUnimedCgFaturamentoSubject(subject: string): boolean {
  return UNIMED_CG_SUBJECT_RE.test(subject);
}

/**
 * Extrai o href do link "Clique aqui" no HTML do e-mail.
 * Só aceita hosts da allowlist OPME.
 */
export function extractCliqueAquiUrl(html: string): string | null {
  const patterns = [
    /<a[^>]+href=["']([^"']+)["'][^>]*>\s*Clique\s+aqui\s*<\/a>/i,
    /href=["']([^"']*visualiza-email-processo\.php[^"']*)["']/i,
  ];
  for (const re of patterns) {
    const match = re.exec(html);
    if (!match?.[1]) continue;
    const raw = match[1].replace(/&amp;/g, '&').trim();
    try {
      const url = new URL(raw);
      if (!UNIMED_CG_OPME_HOSTS.includes(url.hostname as (typeof UNIMED_CG_OPME_HOSTS)[number])) {
        continue;
      }
      return url.toString();
    } catch {
      continue;
    }
  }
  return null;
}

function parseBrlToCents(raw: string): number | null {
  const cleaned = raw.trim().replace(/\s/g, '');
  const match = /^(\d{1,3}(?:\.\d{3})*|\d+),(\d{2})$/.exec(cleaned);
  if (!match) return null;
  const whole = Number.parseInt(match[1].replace(/\./g, ''), 10);
  const frac = Number.parseInt(match[2], 10);
  if (!Number.isInteger(whole) || !Number.isInteger(frac)) return null;
  return whole * 100 + frac;
}

function labeledValue(text: string, re: RegExp): string | null {
  const match = re.exec(text);
  const value = match?.[1]?.replace(/\s+/g, ' ').trim();
  return value || null;
}

function parseBrDate(raw: string | null): Date | null {
  if (!raw) return null;
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(raw.trim());
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n+/g, '\n');
}

export function computeUnimedCgParseStatus(input: {
  processId: string | null;
  authorizationNumber: string | null;
  location: string | null;
  totalCents: number | null;
}): UnimedCgParseStatus {
  if (!input.processId) return 'falha';
  const ok =
    Boolean(input.authorizationNumber?.trim())
    && Boolean(input.location?.trim())
    && input.totalCents != null
    && input.totalCents >= 0;
  if (ok) return 'ok';
  return 'parcial';
}

export function parseAuthorizationPageHtml(
  html: string,
  subjectProcessId: string | null,
): ParsedUnimedCgPage {
  const text = stripHtml(html);
  const htmlProcess = labeledValue(text, /Processo\s*:\s*(\d+)/i);
  let processId = subjectProcessId || htmlProcess || '';
  if (subjectProcessId && htmlProcess && subjectProcessId !== htmlProcess) {
    log.warn(
      { subjectProcessId, htmlProcess },
      'unimed_cg_process_id_mismatch_prefer_subject',
    );
    processId = subjectProcessId;
  }

  const authorizationNumber = labeledValue(text, /Autoriza[cç][aã]o\s*:\s*([0-9.\-\/]+)/i);
  const procedureDate = parseBrDate(
    labeledValue(text, /Data\s+prevista\s+do\s+[Pp]rocedimento\s*:\s*(\d{2}\/\d{2}\/\d{4})/i),
  );
  const location = labeledValue(text, /Local\s*:\s*([^\n]+)/i);
  const totalRaw = labeledValue(text, /Valor\s+total\s*:\s*(?:R\$\s*)?([0-9.\s]+,\d{2})/i);
  const totalCents = totalRaw ? parseBrlToCents(totalRaw.replace(/\s/g, '')) : null;

  const parsed = {
    processId,
    authorizationNumber: authorizationNumber?.trim() || null,
    procedureDate,
    location: location?.trim() || null,
    totalCents,
  };

  return {
    ...parsed,
    parseStatus: computeUnimedCgParseStatus(parsed),
  };
}

export function shouldUpgrade(
  current: UnimedCgParseStatus,
  next: UnimedCgParseStatus,
): boolean {
  return UNIMED_CG_PARSE_RANK[next] > UNIMED_CG_PARSE_RANK[current];
}

export function buildFileName(processId: string): string {
  const safe = processId.replace(/[^\d]/g, '') || '0';
  return `UNIMED-CG ${safe}.pdf`;
}
