import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { todayInSaoPaulo } from './validity';

export type PdfValidityResult = {
  validUntil: string | null;
  confidence: 'alta' | 'media' | 'nenhuma';
  matchedLabel: string | null;
  textChars: number;
};

const NONE: PdfValidityResult = {
  validUntil: null,
  confidence: 'nenhuma',
  matchedLabel: null,
  textChars: 0,
};

const MESES: Record<string, number> = {
  janeiro: 1, fevereiro: 2, marco: 3, abril: 4, maio: 5, junho: 6,
  julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
  jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6,
  jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12,
};

/**
 * Duas formas reais. A numérica é a das certidões federais/estaduais/FGTS.
 * A por extenso é a da CNDG de Campo Grande, que imprime
 * `Validade até: 1 de dezembro de 2024` — dia sem zero à esquerda e mês por
 * nome. Sem ela a certidão municipal sai sem validade apesar de ter texto.
 *
 * O `(?!\d)` impede que um número maior colado à data (um protocolo, p. ex.)
 * seja truncado nos primeiros dígitos: `29/09/20261` tem de ser recusado, não
 * lido como 29/09/2026.
 */
const DATE_NUM = String.raw`\d{2}/\d{2}/(?:\d{4}|\d{2})(?!\d)`;
const DATE_EXT = String.raw`\d{1,2}\s+de\s+[a-z]{3,9}\s+de\s+\d{4}(?!\d)`;
const DATE = String.raw`((?<!\d)(?:${DATE_NUM}|${DATE_EXT}))`;
/**
 * Alternativas da mais longa para a mais curta: `validade ate` tem de vir
 * antes de `validade`, senão o rótulo real da CNDG (`Validade até:`) casa só
 * o prefixo e a palavra `ate` sobra entre o rótulo e a data, matando o
 * casamento.
 *
 * O `\b` inicial impede casar dentro de palavra de sentido oposto:
 * `Certidao invalida ate 12/10/2026` casava `valida ate` e devolvia a data.
 */
const LABEL = String.raw`\b(certidao\s+valida\s+ate|validade\s+ate|valida\s+ate|validade)`;

/** Faixa (X a Y) tem de vir antes do rótulo simples, senão devolve X. */
const RANGE_SOURCE = `${LABEL}\\s*:?\\s*(?:de\\s+)?${DATE}\\s+a\\s+${DATE}`;
const SIMPLE_SOURCE = `${LABEL}\\s*:?\\s*${DATE}`;

type ValidityRule = {
  source: string;
  dateGroup: number;
  labelGroup: number;
};

const RANGE_RULE: ValidityRule = { source: RANGE_SOURCE, dateGroup: 3, labelGroup: 1 };
const SIMPLE_RULE: ValidityRule = { source: SIMPLE_SOURCE, dateGroup: 2, labelGroup: 1 };
const RULES: ValidityRule[] = [RANGE_RULE, SIMPLE_RULE];

type PdfJsTextItem = { str?: unknown };
type PdfJsDocument = {
  numPages: number;
  getPage: (n: number) => Promise<{
    getTextContent: () => Promise<{ items: PdfJsTextItem[] }>;
  }>;
  destroy: () => Promise<void>;
};
type PdfJsModule = {
  getDocument: (src: {
    data: Uint8Array;
    useSystemFonts?: boolean;
    disableFontFace?: boolean;
    isEvalSupported?: boolean;
    useWorkerFetch?: boolean;
    verbosity?: number;
    isOffscreenCanvasSupported?: boolean;
  }) => { promise: Promise<PdfJsDocument> };
  GlobalWorkerOptions?: { workerSrc: string };
};

let pdfJsModule: Promise<PdfJsModule> | null = null;

async function loadPdfJs(): Promise<PdfJsModule> {
  if (!pdfJsModule) {
    // Import dinâmico do asset em public/ — estático no topo entra no bundle do cliente.
    const href = pathToFileURL(join(process.cwd(), 'public/pdfjs/build/pdf.mjs')).href;
    pdfJsModule = import(/* @vite-ignore */ href) as Promise<PdfJsModule>;
  }
  const mod = await pdfJsModule;
  const workerHref = pathToFileURL(join(process.cwd(), 'public/pdfjs/build/pdf.worker.mjs')).href;
  if (mod.GlobalWorkerOptions && !mod.GlobalWorkerOptions.workerSrc.startsWith('file:')) {
    mod.GlobalWorkerOptions.workerSrc = workerHref;
  }
  return mod;
}

function foldPdfText(text: string): string {
  return text
    .normalize('NFC')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s*\/\s*/g, '/')
    .replace(/\s+/g, ' ')
    .trim();
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function parseBrDate(token: string): { ymd: string; yearDigits: 2 | 4 } | null {
  const extenso = /^(\d{1,2})\s+de\s+([a-z]{3,9})\s+de\s+(\d{4})$/.exec(token);
  if (extenso) {
    const mes = MESES[extenso[2]];
    if (!mes) return null;
    return buildYmd(Number(extenso[1]), mes, Number(extenso[3]), 4);
  }
  const match = /^(\d{2})\/(\d{2})\/(\d{4}|\d{2})$/.exec(token);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const yearToken = match[3];
  const year = yearToken.length === 2 ? 2000 + Number(yearToken) : Number(yearToken);
  return buildYmd(day, month, year, yearToken.length === 2 ? 2 : 4);
}

/** Rejeita data civilmente inexistente (31/09, 29/02 fora de bissexto). */
function buildYmd(day: number, month: number, year: number, yearDigits: 2 | 4):
  { ymd: string; yearDigits: 2 | 4 } | null {
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (utc.getUTCFullYear() !== year || utc.getUTCMonth() !== month - 1 || utc.getUTCDate() !== day) {
    return null;
  }
  return { ymd: `${year}-${pad2(month)}-${pad2(day)}`, yearDigits };
}

function addCivilYears(ymd: string, years: number): string {
  const [year, month, day] = ymd.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year + years, month, 0)).getUTCDate();
  return `${year + years}-${pad2(month)}-${pad2(Math.min(day, lastDay))}`;
}

function isPlausibleYmd(ymd: string, todayYmd: string): boolean {
  return ymd <= addCivilYears(todayYmd, 10) && ymd >= addCivilYears(todayYmd, -5);
}

function canonicalLabel(raw: string): string {
  const folded = raw.replace(/\s+/g, ' ');
  if (folded.startsWith('certidao')) return 'Certidao valida ate';
  if (folded.startsWith('validade')) return 'Validade';
  if (folded.startsWith('valida')) return 'Valida ate';
  return 'Validade';
}

function countExtractedChars(text: string): number {
  return text.replace(/\s+/g, '').length;
}

export function matchValidityFromText(text: string, todayYmd: string = todayInSaoPaulo()): PdfValidityResult {
  const textChars = countExtractedChars(text);
  if (textChars === 0) {
    return { validUntil: null, confidence: 'nenhuma', matchedLabel: null, textChars: 0 };
  }

  const normalized = foldPdfText(text);
  for (const rule of RULES) {
    const re = new RegExp(rule.source, 'g');
    let casouSemDataUtil = false;
    for (const match of normalized.matchAll(re)) {
      const parsed = parseBrDate(match[rule.dateGroup] ?? '');
      if (!parsed) { casouSemDataUtil = true; continue; }
      if (!isPlausibleYmd(parsed.ymd, todayYmd)) { casouSemDataUtil = true; continue; }
      return {
        validUntil: parsed.ymd,
        confidence: parsed.yearDigits === 4 ? 'alta' : 'media',
        matchedLabel: canonicalLabel(match[rule.labelGroup] ?? ''),
        textChars,
      };
    }
    /**
     * Uma faixa `X a Y` cujo fim não serve (31/09 não existe; ano gralhado)
     * NÃO pode cair na regra simples: ela casaria o mesmo rótulo e devolveria
     * X — a data de INÍCIO — como validade, e ainda com confiança alta. É
     * exatamente o erro que a ordem das regras existe para impedir.
     */
    if (rule === RANGE_RULE && casouSemDataUtil) break;
  }

  return { validUntil: null, confidence: 'nenhuma', matchedLabel: null, textChars };
}

async function extractPdfText(data: Uint8Array): Promise<string> {
  const pdfjs = await loadPdfJs();
  const task = pdfjs.getDocument({
    data,
    useSystemFonts: false,
    disableFontFace: true,
    isEvalSupported: false,
    useWorkerFetch: false,
    isOffscreenCanvasSupported: false,
    verbosity: 0,
  });
  const doc = await task.promise;
  try {
    const parts: string[] = [];
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
      const page = await doc.getPage(pageNumber);
      const content = await page.getTextContent();
      for (const item of content.items) {
        if (typeof item.str === 'string' && item.str) parts.push(item.str);
      }
    }
    return parts.join(' ');
  } finally {
    await doc.destroy();
  }
}

export async function readValidityFromPdf(
  data: Uint8Array | Buffer,
  todayYmd: string = todayInSaoPaulo(),
): Promise<PdfValidityResult> {
  try {
    const bytes = new Uint8Array(data);
    const extracted = await extractPdfText(bytes);
    const textChars = countExtractedChars(extracted);
    if (textChars === 0) {
      return { validUntil: null, confidence: 'nenhuma', matchedLabel: null, textChars: 0 };
    }
    return matchValidityFromText(extracted, todayYmd);
  } catch {
    return { ...NONE };
  }
}
