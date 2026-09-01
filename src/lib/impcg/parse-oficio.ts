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

/** Aceita BRL (`12.550,00`) ou decimal canônico da API (`12550.00`). */
export function parseImpcgItemDraft(row: {
  description: string;
  anvisaCode?: string | null;
  brand?: string | null;
  reference?: string | null;
  quantity: string;
  unitAmount: string;
  lineTotal: string;
}): ParsedImpcgItem | null {
  const description = row.description.trim().toUpperCase();
  if (!description) return null;
  const unitCents = parseMoneyInputToCents(row.unitAmount);
  const lineCents = parseMoneyInputToCents(row.lineTotal);
  const quantity = row.quantity.trim();
  if (unitCents === null || lineCents === null || !/^\d+(\.\d{1,4})?$/.test(quantity)) {
    return null;
  }
  return {
    anvisaCode: row.anvisaCode?.replace(/\D/g, '') || null,
    description,
    brand: row.brand?.trim().toUpperCase() || null,
    reference: row.reference?.trim() || null,
    quantity,
    unitCents,
    lineCents,
  };
}

export function parseMoneyInputToCents(raw: string): number | null {
  const fromBrl = parseBrlToCents(raw);
  if (fromBrl !== null) return fromBrl;
  const cleaned = raw.trim().replace(/\s/g, '');
  const dotted = /^(\d+)\.(\d{2})$/.exec(cleaned);
  if (dotted) {
    const whole = Number.parseInt(dotted[1], 10);
    const frac = Number.parseInt(dotted[2], 10);
    if (!Number.isInteger(whole) || !Number.isInteger(frac)) return null;
    return whole * 100 + frac;
  }
  if (/^\d+$/.test(cleaned)) {
    const whole = Number.parseInt(cleaned, 10);
    return Number.isInteger(whole) ? whole * 100 : null;
  }
  return null;
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

/**
 * Layout novo: `MÉDICO: NOME` / `MÉDICO : NOME CRM: 123`.
 * Layout antigo (Brother): `MÉDICO DR. NOME` sem dois-pontos e sem CRM.
 */
export function extractDoctorFields(text: string): { doctorName: string | null; doctorCrm: string | null } {
  const withColon = /m[eé]dico\s*:\s*([^\n]+)/i.exec(text);
  const withoutColon = /m[eé]dico\s+(?:dr\.?a?\.?\s+)?([^\n]+)/i.exec(text);
  const doctorRaw = (withColon?.[1] ?? withoutColon?.[1] ?? '').replace(/\s+/g, ' ').trim() || null;
  const doctorName = normalizeName(
    doctorRaw
      ?.replace(/\s+crm\b[\s:]*.*$/i, '')
      .replace(/^[^A-Za-zÀ-ÿ]+/, '')
      .replace(/^(?:dr\.?a?\.?\s+)/i, '')
    ?? null,
  );
  const crmFromLine = doctorRaw ? /\bcrm\s*:?\s*(\d{4,10})\b/i.exec(doctorRaw)?.[1] : null;
  const crmLabeled = labeledValue(text, /crm\s*:\s*([^\n]+)/i);
  const doctorCrm = (crmFromLine || crmLabeled || '').replace(/\D/g, '') || null;
  return { doctorName, doctorCrm };
}

function extractOficioNumber(text: string, subject: string): string | null {
  const fromDoc = /ordem\s+de\s+fornecimento\s+n[ºo°.]?\s*(\d{1,20})/i.exec(text)
    ?? /of[ií]cio\s*n[ºo°.]?\s*["']?\s*(\d{1,20})/i.exec(text)
    ?? /\bn[ºo°.]?\s*(\d{4,20})\b/i.exec(text);
  if (fromDoc?.[1]) return normalizeOficioNumber(fromDoc[1]);
  const fromSubject = /\b(?:of|oficio|ordem)\s*(\d{1,20})\b/i.exec(subject)
    ?? /\b(\d{4,20})\b/.exec(subject);
  return normalizeOficioNumber(fromSubject?.[1] ?? null);
}

const PT_MONTHS: Record<string, number> = {
  janeiro: 1,
  fevereiro: 2,
  marco: 3,
  abril: 4,
  maio: 5,
  junho: 6,
  julho: 7,
  agosto: 8,
  setembro: 9,
  outubro: 10,
  novembro: 11,
  dezembro: 12,
};

function ocrDigits(raw: string): string {
  return raw.replace(/[Oo]/g, '0').replace(/[Il|]/g, '1');
}

/** Um dia de folga cobre fuso; além disso é OCR errado, não data real. */
const FUTURE_TOLERANCE_MS = 24 * 60 * 60 * 1000;

/** Ofício não é emitido no futuro: 2034 é "2024" lido errado, não data válida. */
export function isImpossibleIssuedAt(value: Date | string | null | undefined): boolean {
  if (!value) return false;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return date.getTime() > Date.now() + FUTURE_TOLERANCE_MS;
}

function utcDate(day: number, month: number, year: number): Date | null {
  if (year < 1990 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  if (isImpossibleIssuedAt(date)) return null;
  return date;
}

function parseDateChunk(chunk: string): Date | null {
  const numeric = ocrDigits(chunk.replace(/[–—]/g, '-'));
  const slash = /\b(\d{1,2})\s*[/\-.]\s*(\d{1,2})\s*[/\-.]\s*(\d{4})\b/.exec(numeric);
  if (slash) {
    const parsed = utcDate(
      Number.parseInt(slash[1], 10),
      Number.parseInt(slash[2], 10),
      Number.parseInt(slash[3], 10),
    );
    if (parsed) return parsed;
  }

  const extenso = /(\d{1,2})\s+de\s+([A-Za-zÀ-ÿ]+)\s+de\s+(\d{4})/i.exec(chunk);
  if (extenso) {
    const monthKey = extenso[2]
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
    const month = PT_MONTHS[monthKey];
    const day = Number.parseInt(ocrDigits(extenso[1]), 10);
    const year = Number.parseInt(ocrDigits(extenso[3]), 10);
    if (month) return utcDate(day, month, year);
  }
  return null;
}

function lastCampoGrandeDate(text: string): Date | null {
  const cityLine = /campo\s+grande[^\n]{0,120}/gi;
  let last: Date | null = null;
  let match = cityLine.exec(text);
  while (match) {
    const parsed = parseDateChunk(match[0]);
    if (parsed) last = parsed;
    match = cityLine.exec(text);
  }
  return last;
}

function extractIssuedAt(text: string): Date | null {
  const fromCity = lastCampoGrandeDate(text);
  if (fromCity) return fromCity;

  const labeled = /(?:^|\n)\s*data\s*[:\-]\s*([^\n]+)/i.exec(text);
  if (labeled?.[1]) {
    const fromLabel = parseDateChunk(labeled[1]);
    if (fromLabel) return fromLabel;
  }
  return null;
}

function extractPatientFromSubject(subject: string): string | null {
  const afterNumber = /(?:of|oficio|ordem)\s*\d{1,20}\s+(.+)/i.exec(subject);
  return normalizeName(afterNumber?.[1] ?? null);
}

function parseItems(text: string): ParsedImpcgItem[] {
  const items: ParsedImpcgItem[] = [];
  let pendingDesc = '';
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine
      .replace(/[|]/g, ' ')
      .replace(/R\$/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!line || /total(?:\s+geral)?/i.test(line) || /itens\s+aprovad/i.test(line)) {
      pendingDesc = '';
      continue;
    }
    if (/anvisa|descri|valor\s+r\$/i.test(line) && (line.match(new RegExp(BRL_MONEY.source, 'g'))?.length ?? 0) < 2) {
      continue;
    }
    const amounts = [...line.matchAll(new RegExp(BRL_MONEY.source, 'g'))];
    if (amounts.length < 2) {
      if (
        items.length > 0
        && line.length <= 48
        && /[A-Za-zÀ-ÿ]{3,}/.test(line)
        && !/[a-zà-ÿ]/.test(line)
        && !/^(paciente|m[eé]dico|obs|campo|fornecedor|local|procedimento|matr|of[ií]cio|ordem|solicita|nada|essa|os materiais|item|qtd|marca|valor)\b/i.test(line)
      ) {
        const last = items[items.length - 1];
        last.description = `${last.description} ${line}`.replace(/\s+/g, ' ').trim().toUpperCase();
        continue;
      }
      if (/[A-Za-zÀ-ÿ]{3,}/.test(line) && !/^(item|qtd|marca|obs|valor)\b/i.test(line)) {
        pendingDesc = line;
      }
      continue;
    }
    const unitRaw = `${amounts[amounts.length - 2][1]},${amounts[amounts.length - 2][2]}`;
    const lineRaw = `${amounts[amounts.length - 1][1]},${amounts[amounts.length - 1][2]}`;
    const unitCents = parseBrlToCents(unitRaw);
    const lineCents = parseBrlToCents(lineRaw);
    if (unitCents === null || lineCents === null) continue;

    let head = line.slice(0, amounts[amounts.length - 2].index).trim();
    const anvisaMatch = /(\d{8,14})/.exec(head) ?? /\b(\d{6,7})\b/.exec(head);
    const anvisaCode = anvisaMatch?.[1] ?? null;
    if (anvisaMatch) {
      head = `${head.slice(0, anvisaMatch.index)} ${head.slice(anvisaMatch.index + anvisaMatch[0].length)}`.trim();
    }
    head = head.replace(/^\d{1,3}\s+/, '').replace(/\s+/g, ' ').trim();

    let quantity: string | null = null;
    const trailingQty = /(\d{1,3})\s*$/.exec(head);
    if (trailingQty) {
      quantity = trailingQty[1];
      head = head.slice(0, trailingQty.index).trim();
    } else {
      const leadingQty = /^(\d{1,3})\b/.exec(head);
      if (leadingQty) {
        quantity = leadingQty[1];
        head = head.slice(leadingQty[0].length).trim();
      } else if (unitCents === lineCents) {
        quantity = '1';
      }
    }
    if (!quantity) continue;

    if (pendingDesc && !/[A-Za-zÀ-ÿ]{3,}/.test(head)) {
      head = `${pendingDesc} ${head}`.replace(/\s+/g, ' ').trim();
    }
    pendingDesc = '';
    const parts = head.split(' ').filter(Boolean);
    if (parts.length === 0) continue;

    let brand: string | null = null;
    let reference: string | null = null;
    let description = parts.join(' ');
    const last = parts[parts.length - 1] ?? '';
    const lastLooksCode = /\d/.test(last) || /^[A-Z0-9.\-]{1,6}$/i.test(last);
    if (parts.length >= 3 && lastLooksCode) {
      reference = last;
      brand = parts[parts.length - 2] ?? null;
      description = parts.slice(0, -2).join(' ');
    } else if (parts.length === 2 && lastLooksCode) {
      brand = last;
      description = parts[0];
    }
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

export function computeImpcgParseStatus(parsed: Omit<ParsedImpcgOficio, 'parseStatus'>): ImpcgParseStatus {
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
    && !isImpossibleIssuedAt(parsed.issuedAt)
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
  if (!input.procedureName) missing.push('procedimento');
  if (!input.hospitalName) missing.push('hospital');
  if (!input.issuedAt) missing.push('data');
  else if (isImpossibleIssuedAt(input.issuedAt)) missing.push('data inválida');
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

/** Lista/popup: CRM ausente não deixa parcial; status persistido pode estar velho. */
export function presentImpcgReadStatus(input: ImpcgParseGapInput): {
  parseStatus: ImpcgParseStatus;
  parseMissingReason: string | null;
} {
  if (input.parseStatus === 'falha') {
    return {
      parseStatus: 'falha',
      parseMissingReason: 'Não foi possível ler o documento',
    };
  }
  const parseMissingReason = describeImpcgParseGap({ ...input, parseStatus: 'parcial' });
  if (!parseMissingReason) {
    return { parseStatus: 'ok', parseMissingReason: null };
  }
  return { parseStatus: 'parcial', parseMissingReason };
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
  const { doctorName, doctorCrm } = extractDoctorFields(text);
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

  return { ...parsed, parseStatus: computeImpcgParseStatus(parsed) };
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
