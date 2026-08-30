import { IMPCG_PARSE_RANK, type ImpcgParseStatus } from './constants';

export type ParsedImpcgItem = {
  anvisaCode: string | null;
  description: string;
  brand: string | null;
  reference: string | null;
  quantity: string;
  unitCents: number;
  lineCents: number;
};

export type ParsedImpcgOficio = {
  oficioNumber: string | null;
  issuedAt: Date | null;
  patientName: string;
  patientRegistry: string | null;
  doctorName: string | null;
  doctorCrm: string | null;
  procedureName: string | null;
  hospitalName: string | null;
  totalCents: number | null;
  items: ParsedImpcgItem[];
  parseStatus: ImpcgParseStatus;
};

const BRL_MONEY = /(\d{1,3}(?:\.\d{3})+|\d+),(\d{2})/g;

/** Converte "12.550,00" em centavos inteiros — sem float. */
export function parseBrlToCents(raw: string): number | null {
  const cleaned = raw.trim().replace(/\s/g, '');
  const match = /^(\d{1,3}(?:\.\d{3})*|\d+),(\d{2})$/.exec(cleaned);
  if (!match) return null;
  const whole = Number.parseInt(match[1].replace(/\./g, ''), 10);
  const frac = Number.parseInt(match[2], 10);
  if (!Number.isInteger(whole) || !Number.isInteger(frac)) return null;
  return whole * 100 + frac;
}

export function normalizeOficioNumber(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 1 || digits.length > 20) return null;
  return digits;
}

function normalizeName(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw
    .replace(/\s+/g, ' ')
    .replace(/[^A-Za-zÀ-ÿ0-9 .\-]/g, '')
    .trim()
    .toUpperCase();
  return cleaned || null;
}

function labeledValue(text: string, labels: RegExp): string | null {
  const match = labels.exec(text);
  if (!match?.[1]) return null;
  return match[1].replace(/\s+/g, ' ').trim() || null;
}

function extractOficioNumber(text: string, subject: string): string | null {
  const fromDoc = /ordem\s+de\s+fornecimento\s+n[ºo°.]?\s*(\d{1,20})/i.exec(text)
    ?? /\bn[ºo°.]?\s*(\d{4,20})\b/i.exec(text);
  if (fromDoc?.[1]) return normalizeOficioNumber(fromDoc[1]);
  const fromSubject = /\b(?:of|oficio|ordem)\s*(\d{1,20})\b/i.exec(subject)
    ?? /\b(\d{4,20})\b/.exec(subject);
  return normalizeOficioNumber(fromSubject?.[1] ?? null);
}

function extractIssuedAt(text: string): Date | null {
  const match = /\b(\d{2})\/(\d{2})\/(\d{4})\b/.exec(text);
  if (!match) return null;
  const day = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const year = Number.parseInt(match[3], 10);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return new Date(Date.UTC(year, month - 1, day));
}

function extractPatientFromSubject(subject: string): string | null {
  const afterNumber = /(?:of|oficio|ordem)\s*\d{1,20}\s+(.+)/i.exec(subject);
  return normalizeName(afterNumber?.[1] ?? null);
}

function parseItems(text: string): ParsedImpcgItem[] {
  const items: ParsedImpcgItem[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine
      .replace(/[|]/g, ' ')
      .replace(/R\$/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!line || /total(?:\s+geral)?/i.test(line) || /itens\s+aprovad/i.test(line)) {
      continue;
    }
    if (/anvisa|descri/i.test(line) && (line.match(new RegExp(BRL_MONEY.source, 'g'))?.length ?? 0) < 2) {
      continue;
    }
    const amounts = [...line.matchAll(new RegExp(BRL_MONEY.source, 'g'))];
    if (amounts.length < 2) continue;
    const unitRaw = `${amounts[amounts.length - 2][1]},${amounts[amounts.length - 2][2]}`;
    const lineRaw = `${amounts[amounts.length - 1][1]},${amounts[amounts.length - 1][2]}`;
    const unitCents = parseBrlToCents(unitRaw);
    const lineCents = parseBrlToCents(lineRaw);
    if (unitCents === null || lineCents === null) continue;

    const beforeMoney = line.slice(0, amounts[amounts.length - 2].index).trim();
    const qtyMatch = /(\d+)\s*$/.exec(beforeMoney);
    if (!qtyMatch) continue;
    const quantity = qtyMatch[1];
    let head = beforeMoney.slice(0, qtyMatch.index).trim();
    head = head.replace(/^\d{1,3}\s+/, '');
    const anvisaMatch = /^(\d{8,})\s+/.exec(head);
    const anvisaCode = anvisaMatch?.[1] ?? null;
    if (anvisaMatch) head = head.slice(anvisaMatch[0].length).trim();
    const parts = head.split(' ').filter(Boolean);
    if (parts.length < 3) continue;

    const reference = parts[parts.length - 1] ?? null;
    const brand = parts[parts.length - 2] ?? null;
    const description = parts.slice(0, -2).join(' ');
    if (!description) continue;

    items.push({
      anvisaCode,
      description: description.toUpperCase(),
      brand: normalizeName(brand),
      reference,
      quantity,
      unitCents,
      lineCents,
    });
  }
  return items;
}

function resolveStatus(parsed: Omit<ParsedImpcgOficio, 'parseStatus'>): ImpcgParseStatus {
  const documentEmpty = parsed.items.length === 0
    && parsed.totalCents === null
    && !parsed.issuedAt
    && !parsed.doctorName
    && !parsed.hospitalName
    && !parsed.procedureName;
  if (documentEmpty) return 'falha';

  const headerComplete = Boolean(
    parsed.oficioNumber
    && parsed.issuedAt
    && parsed.patientName !== 'PACIENTE'
    && parsed.doctorName
    && parsed.hospitalName
    && parsed.procedureName
    && parsed.items.length > 0
    && parsed.totalCents !== null,
  );
  const itemSum = parsed.items.reduce((sum, item) => sum + item.lineCents, 0);
  const totalsMatch = parsed.totalCents !== null && itemSum === parsed.totalCents;
  if (headerComplete && totalsMatch) return 'ok';
  return 'parcial';
}

export type ImpcgParseGapInput = {
  parseStatus: ImpcgParseStatus;
  oficioNumber: string | null;
  issuedAt: Date | string | null;
  patientName: string;
  doctorName: string | null;
  doctorCrm: string | null;
  procedureName: string | null;
  hospitalName: string | null;
  totalCents: number | null;
  items: Array<{ lineCents: number }>;
};

/** Texto pt-BR do que faltou. Derivado só dos nulos/inconsistências — sem campo inventado. */
export function describeImpcgParseGap(input: ImpcgParseGapInput): string | null {
  if (input.parseStatus === 'ok') return null;
  if (input.parseStatus === 'falha') return 'Não foi possível ler o documento';

  const missing: string[] = [];
  const patient = input.patientName.trim();
  if (!patient || patient.toUpperCase() === 'PACIENTE') missing.push('paciente');
  if (!input.doctorName) missing.push('médico');
  if (!input.doctorCrm) missing.push('CRM');
  if (!input.procedureName) missing.push('procedimento');
  if (!input.hospitalName) missing.push('hospital');
  if (!input.issuedAt) missing.push('data');
  if (!input.oficioNumber) missing.push('número');
  if (input.items.length === 0) missing.push('nenhum item');

  const itemSum = input.items.reduce((sum, item) => sum + item.lineCents, 0);
  if (
    input.totalCents !== null
    && input.items.length > 0
    && itemSum !== input.totalCents
  ) {
    missing.push('soma dos itens ≠ total');
  }

  if (missing.length === 0) return null;
  return `Faltou: ${missing.join(', ')}`;
}

export function parseRank(status: ImpcgParseStatus): number {
  return IMPCG_PARSE_RANK[status];
}

export function shouldUpgrade(current: ImpcgParseStatus, next: ImpcgParseStatus): boolean {
  return parseRank(next) > parseRank(current);
}

export function parseOficio(text: string, subject = ''): ParsedImpcgOficio {
  const haystack = `${text}\n${subject}`;
  const oficioNumber = extractOficioNumber(text, subject);
  const issuedAt = extractIssuedAt(text);
  const documentPatient = normalizeName(labeledValue(text, /paciente\s*:\s*([^\n]+)/i));
  const subjectPatient = extractPatientFromSubject(subject);
  const patientName = documentPatient || subjectPatient || 'PACIENTE';
  const patientRegistry = labeledValue(text, /matr[ií]cula\s*:\s*([^\n]+)/i);
  const doctorRaw = labeledValue(text, /m[eé]dico\s*:\s*([^\n]+)/i);
  const doctorName = normalizeName(doctorRaw?.replace(/\s+crm\b[\s:]*.*$/i, '') ?? null);
  const doctorCrm = (labeledValue(text, /crm\s*:\s*([^\n]+)/i) || '').replace(/\D/g, '') || null;
  const procedureName = normalizeName(labeledValue(text, /procedimento\s*:\s*([^\n]+)/i));
  const hospitalRaw = labeledValue(text, /(?:local\s+de\s+entrega|hospital)\s*:\s*([^\n]+)/i);
  const hospitalName = normalizeName(hospitalRaw);
  const totalMatch = /total(?:\s+geral)?\s*:?\s*(?:r\$)?\s*([0-9.]+\s*,\s*\d{2})/i.exec(haystack);
  const totalCents = totalMatch ? parseBrlToCents(totalMatch[1].replace(/\s/g, '')) : null;
  const items = parseItems(text);

  const parsed: Omit<ParsedImpcgOficio, 'parseStatus'> = {
    oficioNumber,
    issuedAt,
    patientName,
    patientRegistry: patientRegistry?.trim() || null,
    doctorName,
    doctorCrm,
    procedureName,
    hospitalName,
    totalCents,
    items,
  };

  return { ...parsed, parseStatus: resolveStatus(parsed) };
}

export function buildImpcgFileName(oficioNumber: string, patientName: string): string {
  const safePatient = patientName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[/\\]/g, ' ')
    .replace(/[\x00-\x1f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase() || 'PACIENTE';
  return `OFICIO ${oficioNumber} ${safePatient}.pdf`;
}
