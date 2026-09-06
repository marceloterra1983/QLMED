import { createLogger } from '@/lib/logger';
import {
  UNIMED_CG_ENTREGA_SUBJECT_RE,
  UNIMED_CG_PRAZO_NF_SUBJECT_RE,
  UNIMED_CG_PRE_SOLICITACAO_SUBJECT_RE,
  UNIMED_CG_REVERSAO_SUBJECT_RE,
  UNIMED_CG_SUBJECT_RE,
  type UnimedCgParseStatus,
} from './constants';

const log = createLogger('unimed-cg/parse-email-kinds');

export type UnimedCgMessageKind =
  | 'faturamento'
  | 'entrega'
  | 'reversao'
  | 'pre_solicitacao'
  | 'prazo_nf'
  | 'skip';

export type ParsedUnimedCgReversal = {
  processId: string;
  authorizationNumber: string | null;
  procedureDate: Date | null;
  location: string | null;
  procedureType: string | null;
  parseStatus: UnimedCgParseStatus;
};

export type ParsedUnimedCgPreSolicitation = {
  preSolicitationId: string;
  procedureType: string | null;
  quoteDeadlineDays: number | null;
  parseStatus: UnimedCgParseStatus;
};

export type ParsedUnimedCgInvoiceDeadline = {
  processId: string;
  patientName: string | null;
  parseStatus: UnimedCgParseStatus;
};

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

export function stripEmailHtml(html: string): string {
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

export function classifyUnimedCgSubject(subject: string): UnimedCgMessageKind {
  if (UNIMED_CG_SUBJECT_RE.test(subject)) return 'faturamento';
  if (UNIMED_CG_ENTREGA_SUBJECT_RE.test(subject)) return 'entrega';
  if (UNIMED_CG_REVERSAO_SUBJECT_RE.test(subject)) return 'reversao';
  if (UNIMED_CG_PRE_SOLICITACAO_SUBJECT_RE.test(subject)) return 'pre_solicitacao';
  if (UNIMED_CG_PRAZO_NF_SUBJECT_RE.test(subject)) return 'prazo_nf';
  return 'skip';
}

export function isUnimedCgReversaoSubject(subject: string): boolean {
  return UNIMED_CG_REVERSAO_SUBJECT_RE.test(subject);
}

export function isUnimedCgPreSolicitacaoSubject(subject: string): boolean {
  return UNIMED_CG_PRE_SOLICITACAO_SUBJECT_RE.test(subject);
}

export function isUnimedCgPrazoNfSubject(subject: string): boolean {
  return UNIMED_CG_PRAZO_NF_SUBJECT_RE.test(subject);
}

export function extractProcessIdFromReversaoSubject(subject: string): string | null {
  return UNIMED_CG_REVERSAO_SUBJECT_RE.exec(subject)?.[1] ?? null;
}

export function extractProcessIdFromPrazoNfSubject(subject: string): string | null {
  return UNIMED_CG_PRAZO_NF_SUBJECT_RE.exec(subject)?.[1] ?? null;
}

export function extractPatientNameFromSubject(subject: string): string | null {
  const match = /Pac\.\s*([^\[\]]+?)(?:\s*(?:\[|$))/i.exec(subject);
  const name = match?.[1]?.replace(/\s+/g, ' ').trim();
  return name || null;
}

export function extractProcedureTypeFromPreSubject(subject: string): string | null {
  return UNIMED_CG_PRE_SOLICITACAO_SUBJECT_RE.exec(subject)?.[1] ?? null;
}

export function computeReversalParseStatus(input: {
  processId: string | null;
  authorizationNumber: string | null;
  location: string | null;
}): UnimedCgParseStatus {
  if (!input.processId) return 'falha';
  const ok = Boolean(input.authorizationNumber?.trim()) && Boolean(input.location?.trim());
  return ok ? 'ok' : 'parcial';
}

export function computePreSolicitationParseStatus(input: {
  preSolicitationId: string | null;
  procedureType: string | null;
  quoteDeadlineDays: number | null;
}): UnimedCgParseStatus {
  if (!input.preSolicitationId) return 'falha';
  const ok =
    Boolean(input.procedureType?.trim())
    && input.quoteDeadlineDays != null
    && Number.isInteger(input.quoteDeadlineDays)
    && input.quoteDeadlineDays >= 0;
  return ok ? 'ok' : 'parcial';
}

export function computeInvoiceDeadlineParseStatus(input: {
  processId: string | null;
}): UnimedCgParseStatus {
  if (!input.processId) return 'falha';
  return 'ok';
}

export function parseReversalEmailHtml(
  html: string,
  subjectProcessId: string | null,
): ParsedUnimedCgReversal {
  const text = stripEmailHtml(html);
  const htmlProcess = labeledValue(text, /Processo\s*:\s*(\d+)/i);
  let processId = subjectProcessId || htmlProcess || '';
  if (subjectProcessId && htmlProcess && subjectProcessId !== htmlProcess) {
    log.warn(
      { subjectProcessId, htmlProcess },
      'unimed_cg_reversal_process_id_mismatch_prefer_subject',
    );
    processId = subjectProcessId;
  }

  const authorizationNumber = labeledValue(text, /Autoriza[cç][aã]o\s*:\s*([0-9.\-\/]+)/i);
  const procedureDate = parseBrDate(
    labeledValue(text, /Data\s+prevista\s+do\s+[Pp]rocedimento\s*:\s*(\d{2}\/\d{2}\/\d{4})/i),
  );
  const location = labeledValue(text, /Local\s*:\s*([^\n]+?)(?:\s+Foi\s+REVERTIDO|\s*$)/i)
    || labeledValue(text, /Local\s*:\s*([^\n]+)/i);
  const procedureType = labeledValue(text, /Tipo\s+de\s+procedimento\s*:\s*([^\n]+?)(?:\s+Data\s+prevista|\s*$)/i)
    || labeledValue(text, /Tipo\s+de\s+procedimento\s*:\s*([^\n]+)/i);

  const parsed = {
    processId,
    authorizationNumber: authorizationNumber?.trim() || null,
    procedureDate,
    location: location?.trim() || null,
    procedureType: procedureType?.trim() || null,
  };

  return {
    ...parsed,
    parseStatus: computeReversalParseStatus(parsed),
  };
}

export function parsePreSolicitationEmailHtml(
  html: string,
  subjectProcedureType: string | null,
): ParsedUnimedCgPreSolicitation {
  const text = stripEmailHtml(html);
  const preSolicitationId =
    labeledValue(text, /Pr[eé]-Solicita[cç][aã]o\s+(\d+)/i)
    || labeledValue(text, /Pr[eé]\s*Solicita[cç][aã]o\s*:?\s*(\d+)/i)
    || '';
  const procedureType =
    labeledValue(text, /Tipo\s+do\s+procedimento\s*:\s*([^\n]+)/i)
    || subjectProcedureType
    || null;
  const deadlineRaw = labeledValue(text, /Prazo\s+para\s+a\s+cota[cç][aã]o\s*:\s*(\d+)\s*dias?/i);
  const quoteDeadlineDays = deadlineRaw != null ? Number.parseInt(deadlineRaw, 10) : null;

  const parsed = {
    preSolicitationId,
    procedureType: procedureType?.trim() || null,
    quoteDeadlineDays:
      quoteDeadlineDays != null && Number.isInteger(quoteDeadlineDays) ? quoteDeadlineDays : null,
  };

  return {
    ...parsed,
    parseStatus: computePreSolicitationParseStatus(parsed),
  };
}

export function parseInvoiceDeadlineEmailHtml(
  html: string,
  subjectProcessId: string | null,
  subjectPatientName: string | null,
): ParsedUnimedCgInvoiceDeadline {
  const text = stripEmailHtml(html);
  const htmlProcess =
    labeledValue(text, /N[ºo°]\s*ID\s*\(Solicita[cç][aã]o\)\s*:\s*(\d+)/i)
    || labeledValue(text, /N[uú]mero\s+da\s+Solicita[cç][aã]o\s*:\s*(\d+)/i)
    || labeledValue(text, /Processo\s*:\s*(\d+)/i);
  let processId = subjectProcessId || htmlProcess || '';
  if (subjectProcessId && htmlProcess && subjectProcessId !== htmlProcess) {
    log.warn(
      { subjectProcessId, htmlProcess },
      'unimed_cg_prazo_nf_process_id_mismatch_prefer_subject',
    );
    processId = subjectProcessId;
  }

  const patientName =
    subjectPatientName
    || labeledValue(text, /Paciente\s*:\s*([^\n]+)/i)
    || null;

  const parsed = {
    processId,
    patientName: patientName?.trim() || null,
  };

  return {
    ...parsed,
    parseStatus: computeInvoiceDeadlineParseStatus(parsed),
  };
}

export function buildReversalFileName(processId: string): string {
  const safe = processId.replace(/[^\d]/g, '') || '0';
  return `UNIMED-CG-REVERSAO ${safe}.pdf`;
}

export function buildPreSolicitationFileName(preSolicitationId: string): string {
  const safe = preSolicitationId.replace(/[^\d]/g, '') || '0';
  return `UNIMED-CG-PRE-SOLICITACAO ${safe}.pdf`;
}

export function buildInvoiceDeadlineFileName(processId: string): string {
  const safe = processId.replace(/[^\d]/g, '') || '0';
  return `UNIMED-CG-PRAZO-NF ${safe}.pdf`;
}
