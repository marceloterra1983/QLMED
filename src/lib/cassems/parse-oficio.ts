import { CASSEMS_PARSE_RANK, type CassemsParseStatus } from './constants';

export type ParsedCassemsItem = {
  anvisaCode: string | null;
  description: string;
  brand: string | null;
  reference: string | null;
  quantity: string;
  unitCents: number;
  lineCents: number;
};

export type ParsedCassemsOficio = {
  oficioNumber: string | null;
  issuedAt: Date | null;
  patientName: string;
  patientRegistry: string | null;
  doctorName: string | null;
  doctorCrm: string | null;
  procedureName: string | null;
  hospitalName: string | null;
  totalCents: number | null;
  items: ParsedCassemsItem[];
  parseStatus: CassemsParseStatus;
};

/** Converte "4.760,00" em centavos inteiros — sem float. */
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
  if (digits.length < 6 || digits.length > 20) return null;
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
  const fromAuth = /n[uú]mero\s+de\s+autoriza[cç][aã]o\s*:?\s*(\d{6,20})/i.exec(text);
  if (fromAuth?.[1]) return normalizeOficioNumber(fromAuth[1]);
  const fromSupply = /n[uú]mero\s+do\s+fornecimento\s*:?\s*(\d{6,20})/i.exec(text);
  if (fromSupply?.[1]) return normalizeOficioNumber(fromSupply[1]);
  const fromSubject = /(?:cassems|autoriza(?:cao)?|oficio|of)\s*(\d{6,20})/i.exec(subject)
    ?? /\b(\d{8,20})\b/.exec(subject);
  return normalizeOficioNumber(fromSubject?.[1] ?? null);
}

function extractIssuedAt(text: string): Date | null {
  const match = /data\/hora\s*:?\s*(\d{2})\/(\d{2})\/(\d{4})/i.exec(text)
    ?? /\b(\d{2})\/(\d{2})\/(\d{4})\b/.exec(text);
  if (!match) return null;
  const day = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const year = Number.parseInt(match[3], 10);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return new Date(Date.UTC(year, month - 1, day));
}

function extractPatientFromSubject(subject: string): string | null {
  const afterNumber = /(?:cassems|autoriza(?:cao)?|oficio|of)\s*\d{6,20}\s+(.+)/i.exec(subject);
  return normalizeName(afterNumber?.[1] ?? null);
}

function stripHeaderTokens(token: string): boolean {
  return /^(item|tuss|c[oó]digo|unid\.?|descri[cç][aã]o|material|n[ºo°]|anvisa|vlr|unit\.?|total|r\$|de|do|da|e|-|ref\.?)$/i.test(token);
}

function parseItems(text: string): ParsedCassemsItem[] {
  const items: ParsedCassemsItem[] = [];
  const rowRe = /(\d{8,14})\s+(\d{1,3}(?:\.\d{3})+|\d+),(\d{2})\s+(\d{1,3}(?:\.\d{3})+|\d+),(\d{2})/g;
  const matches = [...text.matchAll(rowRe)];
  const tableHeader = /n[ºo°]?\s*anvisa|descri[cç][aã]o do material|item\s+tuss/i.exec(text);
  const tableOffset = tableHeader?.index ?? 0;

  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const anvisaCode = match[1];
    const unitCents = parseBrlToCents(`${match[2]},${match[3]}`);
    const lineCents = parseBrlToCents(`${match[4]},${match[5]}`);
    if (unitCents === null || lineCents === null) continue;

    const previousEnd = index === 0
      ? tableOffset
      : (matches[index - 1].index ?? 0) + matches[index - 1][0].length;
    const end = match.index ?? 0;
    const start = Math.max(tableOffset, previousEnd, end - 180);
    const before = text.slice(start, end);
    const after = text.slice(end + match[0].length, end + match[0].length + 180);
    const window = before.replace(/\s+/g, ' ').trim();

    let quantity = '1';
    const words: string[] = [];
    for (const token of window.split(' ')) {
      if (!token || stripHeaderTokens(token)) continue;
      if (/^\d{1,4}$/.test(token)) {
        quantity = token;
        continue;
      }
      if (/^\d{5,}$/.test(token) || /^\d+\.\d+(?:\.\d+)*$/.test(token)) continue;
      words.push(token.replace(/[^A-Za-zÀ-ÿ0-9.\-]/g, ''));
    }

    const joined = words.filter(Boolean).join(' ');
    const refFromAfter = /(\d{4,8})\s*-\s*([A-ZÁ-Ü]{3,})/i.exec(after);
    const refFromWindow = /REF\.?\s*([A-Z0-9\-]+)/i.exec(`${before} ${after}`);
    const reference = refFromAfter?.[1] ?? refFromWindow?.[1] ?? null;
    const brand = normalizeName(refFromAfter?.[2] ?? null);
    let description = joined
      .replace(/\bREF\.?\s*[A-Z0-9\-]*\b/gi, ' ')
      .replace(new RegExp(`\\b${reference ?? '___'}\\b`, 'g'), ' ')
      .replace(brand ? new RegExp(`\\b${brand}\\b`, 'g') : /$/, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toUpperCase();
    if (!description) continue;

    items.push({
      anvisaCode,
      description,
      brand,
      reference,
      quantity,
      unitCents,
      lineCents,
    });
  }

  return items;
}

function resolveStatus(parsed: Omit<ParsedCassemsOficio, 'parseStatus'>): CassemsParseStatus {
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

export type CassemsParseGapInput = {
  parseStatus: CassemsParseStatus;
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
export function describeCassemsParseGap(input: CassemsParseGapInput): string | null {
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

export function parseRank(status: CassemsParseStatus): number {
  return CASSEMS_PARSE_RANK[status];
}

export function shouldUpgrade(current: CassemsParseStatus, next: CassemsParseStatus): boolean {
  return parseRank(next) > parseRank(current);
}

export function parseOficio(text: string, subject = ''): ParsedCassemsOficio {
  const haystack = `${text}\n${subject}`;
  const oficioNumber = extractOficioNumber(text, subject);
  const issuedAt = extractIssuedAt(text);
  const patientMatch = /paciente\s+([^,\n]+),\s*matr[ií]cula\s+([0-9.\-]+)/i.exec(text);
  const documentPatient = normalizeName(patientMatch?.[1] ?? labeledValue(text, /paciente\s*:?\s*([^\n,]+)/i));
  const subjectPatient = extractPatientFromSubject(subject);
  const patientName = documentPatient || subjectPatient || 'PACIENTE';
  const patientRegistry = patientMatch?.[2]?.trim()
    || labeledValue(text, /matr[ií]cula\s*:?\s*([0-9.\-]+)/i);
  const doctorRaw = labeledValue(text, /prestador\s+solicitante\s*:?\s*([^\n]+)/i)
    || labeledValue(text, /m[eé]dico\s*:?\s*([^\n]+)/i);
  const doctorName = normalizeName(
    doctorRaw?.replace(/\s*n[ºo°]?\s*crm\b[\s:]*.*$/i, '') ?? null,
  );
  const doctorCrm = (labeledValue(text, /crm\s*:?\s*([0-9]+)/i) || '').replace(/\D/g, '') || null;
  const procedureRaw = labeledValue(text, /procedimento\(s\)\s*:?\s*([^\n;]+)/i)
    || labeledValue(text, /procedimento\s*:?\s*([^\n;]+)/i);
  const procedureName = normalizeName(procedureRaw);
  const hospitalRaw = labeledValue(text, /local\s+de\s+execu[cç][aã]o\s*:?\s*([^\n]+)/i)
    || labeledValue(text, /(?:local\s+de\s+entrega|hospital)\s*:?\s*([^\n]+)/i);
  const hospitalName = normalizeName(hospitalRaw);
  const totalMatch = /valor\s+total\s+com\s+desconto\s*:?\s*(?:r\$)?\s*([0-9.]+\s*,\s*\d{2})/i.exec(haystack)
    || /total(?:\s+geral)?\s*:?\s*(?:r\$)?\s*([0-9.]+\s*,\s*\d{2})/i.exec(haystack);
  const totalCents = totalMatch ? parseBrlToCents(totalMatch[1].replace(/\s/g, '')) : null;
  const items = parseItems(text);

  const parsed: Omit<ParsedCassemsOficio, 'parseStatus'> = {
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

export function buildCassemsFileName(oficioNumber: string, patientName: string): string {
  const safePatient = patientName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[/\\]/g, ' ')
    .replace(/[\x00-\x1f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase() || 'PACIENTE';
  return `CASSEMS ${oficioNumber} ${safePatient}.pdf`;
}

export function oficioFromFileName(name: string): string | null {
  const subject = name.replace(/\.pdf$/i, '').trim();
  const match = /(?:cassems|autoriza(?:cao)?|oficio|of)\s+(\d{6,20})\b/i.exec(subject);
  return normalizeOficioNumber(match?.[1] ?? null);
}
