import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { todayInSaoPaulo } from './validity';

export type PdfValidityResult = {
  validUntil: string | null;
  /** Início da faixa ou rótulo explícito de emissão. Nunca lastModifiedAt. */
  emitidoEm: string | null;
  confidence: 'alta' | 'media' | 'nenhuma';
  matchedLabel: string | null;
  textChars: number;
};

const NONE: PdfValidityResult = {
  validUntil: null,
  emitidoEm: null,
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
/** «01 de abril de 2022» e a forma sem o 2.º «de»: «01 de abril 2022» (TECHIMPORT). */
const DATE_EXT = String.raw`\d{1,2}\s+de\s+[a-z]{3,9}\s+(?:de\s+)?\d{4}(?!\d)`;
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
/**
 * Alternativas da mais longa para a mais curta. Cartas usam "vigente até",
 * "autorizada até" e "com validade até" além dos rótulos de certidão.
 */
const LABEL = String.raw`\b(certidao\s+valida\s+ate|com\s+validade\s+ate|validade\s+desta\s+carta|validade\s+ate|vigencia\s+ate|vigente\s+ate|autorizad[ao]\s+ate|valid[ao]\s+ate(?:\s+o\s+dia)?|validade)`;

/** Faixa (X a Y) tem de vir antes do rótulo simples, senão devolve X. */
const RANGE_SOURCE = `${LABEL}\\s*:?\\s*(?:de\\s+)?${DATE}\\s+a\\s+${DATE}`;
/** «válido até o dia 20/10/2026» — o «o dia» é opcional. */
const SIMPLE_SOURCE = `${LABEL}\\s*:?\\s*(?:o\\s+dia\\s+)?${DATE}`;
/**
 * Rótulos de emissão, do mais longo para o mais curto: `data de emissao`
 * antes de `emissao`, senão a palavra solta casa o sufixo e a data fica
 * atrás de `data de`.
 */
/**
 * Rótulos de emissão colhidos dos PDF REAIS da empresa, lidos em produção em
 * 05/09/2026 — não inventados. As quatro formas encontradas, verbatim:
 *
 *   Receita Federal  "emitida as 16:15:51 do dia 15/06/2026"
 *   CRF FGTS         "informacao obtida em 31/08/2026 09:52:53"
 *   CNDT             "expedicao: 06/04/2026, as 11:00:14"
 *   CND Estadual MS  "certidao emitida as 16:34:20 horas do dia 13/08/2026"
 *
 * A versão anterior só aceitava `emitida em|emitido em|data de emissao|emissao`
 * e por isso extraiu ZERO emissões de 54 documentos reais. Os testes passavam
 * porque as fixtures usavam os rótulos que eu tinha escolhido.
 */
const EMISSAO_LABEL = String.raw`\b(informacao\s+obtida\s+em|data\s+de\s+emissao|data|expedicao|expedida|expedido|emitida|emitido|emissao|campo\s+grande\s*\(ms\)|campo\s+grande)`;

/**
 * Entre o rótulo e a data cabe hora e ligação ("as 16:15:51 do dia"), mas NÃO
 * texto livre: a mesma certidão traz "emitida gratuitamente com base na
 * portaria ... de 2/10/2014", e um preenchimento largo colheria 2014 como
 * emissão. O recheio é fechado de propósito.
 *
 * `data:` das cartas (OSTEOMED) usa só `:` — por isso `data` entra no rótulo
 * e a ligação cobre o `:` sozinho.
 */
const EMISSAO_LIGACAO = String.raw`(?:\s*[:,])?\s*(?:em\s+)?(?:as\s+)?(?:\d{1,2}:\d{2}(?::\d{2})?\s*)?(?:horas\s+)?(?:do\s+dia\s+)?`;

/** Emissão aceita dia de 1 dígito: a Receita imprime "2/10/2014". */
const EMISSAO_DATE = String.raw`((?<!\d)(?:\d{1,2}/\d{2}/(?:\d{4}|\d{2})(?!\d)|\d{1,2}\s+de\s+[a-z]{3,9}\s+(?:de\s+)?\d{4}(?!\d)))`;

const EMISSAO_SOURCE = `${EMISSAO_LABEL}${EMISSAO_LIGACAO}${EMISSAO_DATE}`;

/**
 * Rodapé / cabeçalho de carta: cidade + data.
 * Formas vistas nos PDF reais (OCR já normalizado).
 */
const EMISSAO_CIDADE_SOURCE = String.raw`(?:(?:atenciosamente|cordialmente)[\s\S]{0,160}?|(?:sao\s+paulo|rio\s+de\s+janeiro|rio\s+claro|piracicaba|campinas|limeira|cachoeirinha|sao\s+leopoldo|guarulhos)(?:\s*\([^)]{0,20}\)|\s*\/\s*[a-z]{2}|\s*[–\-]\s*[a-z. ]{1,12})?\s*,\s*)(\d{1,2}\s+de\s+[a-z]{3,9}\s+(?:de\s+)?\d{4})(?!\d)`;

type ValidityRule = {
  source: string;
  dateGroup: number;
  labelGroup: number;
  startGroup?: number;
};

const RANGE_RULE: ValidityRule = { source: RANGE_SOURCE, dateGroup: 3, labelGroup: 1, startGroup: 2 };
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
    /**
     * Import dinâmico do asset em `public/` — estático no topo entraria no
     * bundle do cliente.
     *
     * `webpackIgnore` é OBRIGATÓRIO e não é redundante com `@vite-ignore`:
     * `@vite-ignore` só fala com o Vite, que é o empacotador do vitest. A
     * produção é Next/webpack, que ignorava esse comentário, tentava empacotar
     * o caminho `file://` e falhava — e o `catch` de `readValidityFromPdf`
     * transformava a falha em "0 caracteres extraídos", indistinguível de um
     * PDF digitalizado.
     *
     * Consequência real, medida em 05/09/2026: a leitura de PDF nunca funcionou
     * em produção. 54 documentos com camada de texto perfeita devolveram
     * `textChars: 0`, e a suíte ficava verde porque corre sob Vite.
     */
    const href = pathToFileURL(join(process.cwd(), 'public/pdfjs/build/pdf.mjs')).href;
    pdfJsModule = import(/* webpackIgnore: true */ /* @vite-ignore */ href).then(
      (mod) => mod as PdfJsModule,
      (err) => {
        // Uma falha de CARREGAMENTO não pode passar por "PDF sem texto".
        pdfJsModule = null;
        throw new Error(`pdf.js indisponível: ${err instanceof Error ? err.message : 'erro'}`);
      },
    );
  }
  const mod = await pdfJsModule;
  const workerHref = pathToFileURL(join(process.cwd(), 'public/pdfjs/build/pdf.worker.mjs')).href;
  if (mod.GlobalWorkerOptions && !mod.GlobalWorkerOptions.workerSrc.startsWith('file:')) {
    mod.GlobalWorkerOptions.workerSrc = workerHref;
  }
  return mod;
}

function foldPdfText(text: string): string {
  let s = text
    .normalize('NFC')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s*\/\s*/g, '/');

  // OCR de cartas: dígitos e meses partidos («202 6», «me ses», «Ju lho», «2 02 1»).
  s = s.replace(/\b2\.0(\d{2})\b/g, '20$1');
  s = s.replace(/\b(\d{3})\s+(\d)\b/g, '$1$2'); // 202 6 → 2026
  s = s.replace(/\b(20)\s+(\d{2})\b/g, '$1$2'); // 20 22 → 2022
  s = s.replace(/\b(20)\s*([1-3]\d)\b/g, '$1$2');
  s = s.replace(/\b(\d)\s+(\d)\s+(\d)\s+(\d)\b/g, '$1$2$3$4'); // 2 0 2 1 → 2021
  s = s.replace(/\b(\d)\s+(\d{2})\s+(\d)\b/g, '$1$2$3'); // 2 02 1 → 2021
  s = s.replace(/(\d{1,2}\/\d{2}\/\d{2})\s+(\d)\b/g, '$1$2');
  s = s.replace(/\b(\d)\s+(\d)\s*\/\s*(\d)\s+(\d)\s*\/\s*(\d{4})\b/g, '$1$2/$3$4/$5');
  s = s.replace(/\b(\d)\s+(\d)\s+de\s+/g, '$1$2 de ');
  s = s.replace(/\bd\s+e\s+(\d{4})\b/g, 'de $1');
  s = s.replace(/\bju\s*l\s*ho\b/g, 'julho');
  s = s.replace(/\bjane\s*iro\b/g, 'janeiro');
  s = s.replace(/\bfevere\s*iro\b/g, 'fevereiro');
  s = s.replace(/\bfeverairo\b/g, 'fevereiro'); // tipografia OCR (MACOM)
  s = s.replace(/\bagos\s*to\b/g, 'agosto');
  s = s.replace(/\bsetem\s*bro\b/g, 'setembro');
  s = s.replace(/\boutu\s*bro\b/g, 'outubro');
  s = s.replace(/\bnovem\s*bro\b/g, 'novembro');
  s = s.replace(/\bdezem\s*bro\b/g, 'dezembro');
  s = s.replace(/\bme\s*ses\b/g, 'meses');
  s = s.replace(/\bm\s+eses\b/g, 'meses');

  return s.replace(/\s+/g, ' ').trim();
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function parseBrDate(token: string): { ymd: string; yearDigits: 2 | 4 } | null {
  // «01 de abril de 2022» e «01 de abril 2022» (cartas sem o 2.º «de»).
  const extenso = /^(\d{1,2})\s+de\s+([a-z]{3,9})\s+(?:de\s+)?(\d{4})$/.exec(token);
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

function addCivilMonths(ymd: string, months: number): string {
  const [year, month, day] = ymd.split('-').map(Number);
  const utc = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(Date.UTC(utc.getUTCFullYear(), utc.getUTCMonth() + 1, 0)).getUTCDate();
  return `${utc.getUTCFullYear()}-${pad2(utc.getUTCMonth() + 1)}-${pad2(Math.min(day, lastDay))}`;
}

function addCivilDays(ymd: string, days: number): string {
  const [year, month, day] = ymd.split('-').map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day + days));
  return `${utc.getUTCFullYear()}-${pad2(utc.getUTCMonth() + 1)}-${pad2(utc.getUTCDate())}`;
}

/**
 * Prazo relativo das cartas:
 * - "válida por 12 (doze) meses a contar da emissão"
 * - "são válidos por período de 12 (doze) meses, contados a partir da emissão"
 * - "Validade: Um ano a partir desta data" (MACOM — OCR)
 * Número/palavra + unidade depois de um rótulo — um "12" solto no
 * protocolo não serve.
 */
const DURATION_AMOUNT = String.raw`(\d{1,3}|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze)`;
const DURATION_SOURCE = String.raw`\b(?:valida(?:de)?|valid[oa]s?|vigencia|prazo|autorizacao|carta|credencial|acordo|direitos?\s+de\s+distribui\w*)\b[\s\S]{0,120}?\b(?:(?:por(?:\s+periodo)?(?:\s+de)?|de|pelo prazo de|pelo periodo de)\s+|:\s*)?${DURATION_AMOUNT}(?:\s*\([^)]{0,24}\))?\s+(dias?|meses?|anos?)\b`;

const DURATION_AMOUNT_WORDS: Record<string, number> = {
  um: 1,
  uma: 1,
  dois: 2,
  duas: 2,
  tres: 3,
  quatro: 4,
  cinco: 5,
  seis: 6,
  sete: 7,
  oito: 8,
  nove: 9,
  dez: 10,
  onze: 11,
  doze: 12,
};

function parseDurationAmount(raw: string): number | null {
  const asNumber = Number(raw);
  if (Number.isFinite(asNumber)) return asNumber;
  return DURATION_AMOUNT_WORDS[raw] ?? null;
}

function applyDuration(startYmd: string, amount: number, unit: string): string | null {
  if (amount < 1 || amount > 120) return null;
  if (unit.startsWith('dia')) return addCivilDays(startYmd, amount);
  if (unit.startsWith('mes')) return addCivilMonths(startYmd, amount);
  if (unit.startsWith('ano')) return addCivilYears(startYmd, amount);
  return null;
}

function matchDurationValidUntil(
  normalized: string,
  emitidoEm: string | null,
  todayYmd: string,
): { validUntil: string; matchedLabel: string } | null {
  if (!emitidoEm) return null;
  if (/\bprazo\s+indeterminado\b|\bvalidade\s+indeterminada\b|\bindeterminad[ao]\b/.test(normalized)
    && !new RegExp(DURATION_SOURCE).test(normalized)) {
    return null;
  }
  const re = new RegExp(DURATION_SOURCE, 'g');
  for (const match of normalized.matchAll(re)) {
    const amount = parseDurationAmount(match[1] ?? '');
    if (amount == null) continue;
    const computed = applyDuration(emitidoEm, amount, match[2] ?? '');
    if (!computed) continue;
    if (!isPlausibleYmd(computed, todayYmd) && computed < emitidoEm) continue;
    if (computed < emitidoEm) continue;
    return { validUntil: computed, matchedLabel: 'Prazo' };
  }
  return null;
}

/** Validade: 10 anos à frente, 15 para trás (cartas antigas/vencidas). */
function isPlausibleYmd(ymd: string, todayYmd: string): boolean {
  return ymd <= addCivilYears(todayYmd, 10) && ymd >= addCivilYears(todayYmd, -15);
}

/**
 * Emissão olha para trás, e a janela da validade não serve: a AFE da empresa
 * foi autorizada em 20/08/2007 e o alvará tem emissões igualmente antigas. Com
 * o corte de 5 anos, todo documento antigo perdia a emissão e o popup dizia
 * "não informado" justamente onde a data é mais útil.
 *
 * O futuro continua curto de propósito: um documento não pode ter sido emitido
 * amanhã, e uma data à frente é gralha ou leitura errada.
 */
function isPlausibleEmissaoYmd(ymd: string, todayYmd: string): boolean {
  return ymd <= addCivilYears(todayYmd, 1) && ymd >= addCivilYears(todayYmd, -40);
}

function canonicalLabel(raw: string): string {
  const folded = raw.replace(/\s+/g, ' ');
  if (folded.startsWith('certidao')) return 'Certidao valida ate';
  if (folded.startsWith('com validade')) return 'Com validade ate';
  if (folded.startsWith('validade desta')) return 'Validade';
  if (folded.startsWith('vigencia') || folded.startsWith('vigente')) return 'Vigente ate';
  if (folded.startsWith('autorizad')) return 'Autorizada ate';
  if (folded.startsWith('validade')) return 'Validade';
  if (folded.startsWith('valida') || folded.startsWith('valido')) return 'Valida ate';
  return 'Validade';
}

function countExtractedChars(text: string): number {
  return text.replace(/\s+/g, '').length;
}

function firstPlausibleYmd(
  token: string,
  todayYmd: string,
): { ymd: string; yearDigits: 2 | 4 } | null {
  const parsed = parseBrDate(token);
  if (!parsed) return null;
  if (!isPlausibleYmd(parsed.ymd, todayYmd)) return null;
  return parsed;
}

/** Como `firstPlausibleYmd`, mas com a janela da EMISSÃO (para trás, não para a frente). */
function firstPlausibleEmissaoYmd(token: string, todayYmd: string): { ymd: string } | null {
  const parsed = parseBrDate(token);
  if (!parsed) return null;
  if (!isPlausibleEmissaoYmd(parsed.ymd, todayYmd)) return null;
  return parsed;
}

function matchEmitidoEm(normalized: string, todayYmd: string): string | null {
  const re = new RegExp(EMISSAO_SOURCE, 'g');
  for (const match of normalized.matchAll(re)) {
    const parsed = firstPlausibleEmissaoYmd(match[2] ?? '', todayYmd);
    if (parsed) return parsed.ymd;
  }
  const city = new RegExp(EMISSAO_CIDADE_SOURCE, 'g').exec(normalized);
  if (city?.[1]) {
    const parsed = firstPlausibleEmissaoYmd(city[1], todayYmd);
    if (parsed) return parsed.ymd;
  }
  return null;
}

export function matchValidityFromText(text: string, todayYmd: string = todayInSaoPaulo()): PdfValidityResult {
  const textChars = countExtractedChars(text);
  if (textChars === 0) {
    return { ...NONE };
  }

  const normalized = foldPdfText(text);
  let validUntil: string | null = null;
  let confidence: PdfValidityResult['confidence'] = 'nenhuma';
  let matchedLabel: string | null = null;
  let emitidoEm: string | null = null;

  for (const rule of RULES) {
    const re = new RegExp(rule.source, 'g');
    let casouSemDataUtil = false;
    for (const match of normalized.matchAll(re)) {
      const parsed = firstPlausibleYmd(match[rule.dateGroup] ?? '', todayYmd);
      if (!parsed) { casouSemDataUtil = true; continue; }
      validUntil = parsed.ymd;
      confidence = parsed.yearDigits === 4 ? 'alta' : 'media';
      matchedLabel = canonicalLabel(match[rule.labelGroup] ?? '');
      if (rule.startGroup != null) {
        const start = firstPlausibleEmissaoYmd(match[rule.startGroup] ?? '', todayYmd);
        // Emissão posterior à validade é incoerente: descarta a emissão.
        if (start && start.ymd <= parsed.ymd) emitidoEm = start.ymd;
      }
      break;
    }
    if (validUntil) break;
    /**
     * Uma faixa `X a Y` cujo fim não serve (31/09 não existe; ano gralhado)
     * NÃO pode cair na regra simples: ela casaria o mesmo rótulo e devolveria
     * X — a data de INÍCIO — como validade, e ainda com confiança alta. É
     * exatamente o erro que a ordem das regras existe para impedir.
     */
    if (rule === RANGE_RULE && casouSemDataUtil) break;
  }

  if (emitidoEm == null) {
    emitidoEm = matchEmitidoEm(normalized, todayYmd);
  }
  if (emitidoEm && validUntil && emitidoEm > validUntil) {
    emitidoEm = null;
  }

  if (validUntil == null) {
    const duration = matchDurationValidUntil(normalized, emitidoEm, todayYmd);
    if (duration && (!emitidoEm || duration.validUntil >= emitidoEm)) {
      validUntil = duration.validUntil;
      confidence = 'alta';
      matchedLabel = duration.matchedLabel;
    }
  }

  return { validUntil, emitidoEm, confidence, matchedLabel, textChars };
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

/** Abaixo disto o PDF costuma ser só imagem — OCR (pdftotext/tesseract). */
export const OCR_FALLBACK_MIN_CHARS = 40;

export type ExtractPdfPlainTextOptions = {
  /** Cartas escaneadas: se pdf.js devolver pouco texto, cai no motor OCR. */
  ocrFallback?: boolean;
};

/**
 * Prefere o texto pdf.js quando já há camada de texto; senão o OCR.
 * Exportado para testes — a regra de negócio da carta escaneada.
 */
export function pickRicherPdfText(pdfJsText: string, ocrText: string): string {
  if (countExtractedChars(pdfJsText) >= OCR_FALLBACK_MIN_CHARS) return pdfJsText;
  return countExtractedChars(ocrText) > countExtractedChars(pdfJsText) ? ocrText : pdfJsText;
}

async function tryOcrPlainText(data: Uint8Array | Buffer): Promise<string> {
  try {
    const { extractPdfText: extractWithOcr } = await import('@/lib/pdf/extract-text');
    return await extractWithOcr(Buffer.from(data), { prefix: 'documentos-carta' });
  } catch {
    return '';
  }
}

export async function extractPdfPlainText(
  data: Uint8Array | Buffer,
  options: ExtractPdfPlainTextOptions = {},
): Promise<string> {
  let text = '';
  try {
    text = await extractPdfText(new Uint8Array(data));
  } catch {
    text = '';
  }
  if (!options.ocrFallback) return text;
  if (countExtractedChars(text) >= OCR_FALLBACK_MIN_CHARS) return text;
  const ocr = await tryOcrPlainText(data);
  return pickRicherPdfText(text, ocr);
}

export async function readValidityFromPdf(
  data: Uint8Array | Buffer,
  todayYmd: string = todayInSaoPaulo(),
  options: ExtractPdfPlainTextOptions = {},
): Promise<PdfValidityResult> {
  try {
    const extracted = await extractPdfPlainText(data, options);
    const textChars = countExtractedChars(extracted);
    if (textChars === 0) {
      return { ...NONE, textChars: 0 };
    }
    return matchValidityFromText(extracted, todayYmd);
  } catch {
    return { ...NONE };
  }
}
