import {
  issuedSummaryValueSuffix,
  summarizeIssuedDailySalesHeader,
  type IssuedSummaryInvoiceInput,
} from '@/lib/daily-issued-summary';

export const DAILY_SUMMARY_TZ = 'America/Campo_Grande';
export const DAILY_SUMMARY_MAX_MSG = 3500;
export const DAILY_SUMMARY_APP_DEFAULT = 'https://app.qlmed.com.br';

export type DailySummaryInvoice = IssuedSummaryInvoiceInput & {
  recipientCnpj?: string | null;
  recipientName?: string | null;
};

export type DailySummaryMessage = { jid: string; text: string };

const ZWJ = String.fromCharCode(0x034f);

const TIPO: Record<string, string> = {
  hospital: 'H.',
  hosp: 'H.',
  instituto: 'Inst.',
  fundacao: 'Fund.',
  fundo: 'Fund.',
  associacao: 'Assoc.',
  cooperativa: 'Coop.',
  laboratorio: 'Lab.',
  municipio: 'Mun.',
  municipal: 'Mun.',
  prefeitura: 'Pref.',
  secretaria: 'Sec.',
};
const GENERICO = new Set([
  'sociedade', 'saude', 'assistencia', 'servico', 'servicos', 'diagnostico', 'diagnosticos',
  'tratamento', 'tratamentos', 'especial', 'geral', 'beneficente', 'beneficiente',
  'educacao', 'comercio', 'comercial', 'industria', 'industrial', 'distribuidora',
  'empreendimentos', 'participacoes', 'farmaceutica', 'transporte', 'transportes', 'engenharia',
]);
const LEGAIS = new Set(['ltda', 'me', 'epp', 'eireli', 'mei', 's/a', 's.a', 'sa', 'cia', 'companhia', 'ei']);
const PREP = new Set(['de', 'da', 'do', 'das', 'dos', 'di', 'du', 'em', 'a', 'o', 'e']);
const TIPO_VALS = new Set(Object.values(TIPO));

export function noAutoLink(s: string): string {
  let out = '';
  let prev = false;
  for (const ch of String(s)) {
    const d = ch >= '0' && ch <= '9';
    if (d && prev) out += ZWJ;
    out += ch;
    prev = d;
  }
  return out;
}

function formatBRL(v: number | string | null | undefined): string {
  return (
    'R$ ' +
    Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  );
}

function norm(t: string): string {
  return t.toLowerCase().replace(/^[.,]+|[.,]+$/g, '');
}

function buildName(raw: unknown, aggressive: boolean): string {
  const s = String(raw == null ? '' : raw).trim();
  if (!s) return '';
  const soLetras = s.replace(/[^A-Za-zÀ-ÿ]/g, '');
  const ehMaiuscula = Boolean(soLetras && soLetras === soLetras.toUpperCase());
  const out: string[] = [];
  for (const t of s.split(/\s+/)) {
    const n = norm(t);
    if (!n) continue;
    if (LEGAIS.has(n) || PREP.has(n)) continue;
    if (aggressive && GENERICO.has(n)) continue;
    if (TIPO[n]) {
      out.push(TIPO[n]);
      continue;
    }
    if (!ehMaiuscula) {
      out.push(t);
      continue;
    }
    out.push(t.length <= 2 ? t.toUpperCase() : t.charAt(0).toUpperCase() + t.slice(1).toLowerCase());
  }
  return out.join(' ').replace(/\s+/g, ' ').trim();
}

export function abreviarNome(raw: unknown): string {
  let nome = buildName(raw, true);
  const soTipos = Boolean(nome && nome.split(' ').every((w) => TIPO_VALS.has(w)));
  if (!nome || soTipos) nome = buildName(raw, false);
  if (!nome) return 'Dest. não informado';
  const MAX = 28;
  if (nome.length > MAX) {
    let acc = '';
    for (const w of nome.split(' ')) {
      if ((acc ? `${acc} ${w}` : w).length > MAX) break;
      acc = acc ? `${acc} ${w}` : w;
    }
    nome = `${acc || nome.slice(0, MAX - 1)}…`;
  }
  return nome;
}

export function formatCampoGrandeDateBR(now: Date): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: DAILY_SUMMARY_TZ,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(now);
}

export function formatCampoGrandeDateISO(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: DAILY_SUMMARY_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function hourInCampoGrande(now: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: DAILY_SUMMARY_TZ,
    hour: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(now);
  return Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
}

export function getCampoGrandeDateParts(now: Date = new Date()): {
  dateISO: string;
  hour: number;
  dateBR: string;
} {
  return {
    dateISO: formatCampoGrandeDateISO(now),
    hour: hourInCampoGrande(now),
    dateBR: formatCampoGrandeDateBR(now),
  };
}

/** UTC bounds [start, end) for a calendar day in America/Campo_Grande. */
export function campoGrandeDayUtcBounds(dateISO: string): { start: Date; end: Date } {
  const start = localMidnightUtc(dateISO);
  const [y, m, d] = dateISO.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  const nextISO = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`;
  const end = localMidnightUtc(nextISO);
  return { start, end };
}

function localMidnightUtc(dateISO: string): Date {
  // Binary-search the UTC instant that formats as dateISO 00:00:00 in CG.
  const target = `${dateISO}T00:00:00`;
  let lo = Date.parse(`${dateISO}T00:00:00.000Z`) - 14 * 3600_000;
  let hi = Date.parse(`${dateISO}T00:00:00.000Z`) + 14 * 3600_000;
  for (let i = 0; i < 48; i++) {
    const mid = Math.floor((lo + hi) / 2);
    const key = formatZonedDateTimeKey(new Date(mid), DAILY_SUMMARY_TZ);
    if (key < target) lo = mid + 1;
    else hi = mid;
  }
  return new Date(lo);
}

function formatZonedDateTimeKey(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}`;
}

function nomeExibicao(
  inv: DailySummaryInvoice,
  nicknames: Record<string, string>,
): string {
  const cad = inv.recipientCnpj ? nicknames[inv.recipientCnpj] : null;
  if (cad && String(cad).trim()) return String(cad).trim();
  return abreviarNome(inv.recipientName);
}

function linhaNota(inv: DailySummaryInvoice, nicknames: Record<string, string>): string {
  const num = noAutoLink(inv.number || '—');
  const nome = nomeExibicao(inv, nicknames);
  const valor = noAutoLink(formatBRL(inv.totalValue));
  const sufixo = issuedSummaryValueSuffix(inv.cfop, inv.cfopTag);
  return `▪ *${num}* · ${nome} · ${valor}${sufixo}`;
}

export function buildDailyIssuedSummaryMessages(input: {
  invoices: DailySummaryInvoice[];
  nicknames?: Record<string, string>;
  now?: Date;
  appBaseUrl?: string;
  recipients: string[];
}): DailySummaryMessage[] {
  const invoices = input.invoices ?? [];
  const nicknames = input.nicknames ?? {};
  const now = input.now ?? new Date();
  const app = (input.appBaseUrl ?? DAILY_SUMMARY_APP_DEFAULT).replace(/\/+$/, '');
  const recipients = input.recipients.filter(Boolean);
  if (recipients.length === 0) return [];

  const hoje = formatCampoGrandeDateBR(now);
  const hojeISO = formatCampoGrandeDateISO(now);
  const linkDia = `${app}/fiscal/issued?from=${hojeISO}&to=${hojeISO}`;

  if (invoices.length === 0) {
    const text = `📊 *Resumo do Dia — ${noAutoLink(hoje)}*\n\nNenhuma NF-e emitida hoje.\n\n🔗 Ver emitidas:\n${linkDia}`;
    return recipients.map((jid) => ({ jid, text }));
  }

  const { saleCount, saleTotal } = summarizeIssuedDailySalesHeader(invoices);
  const cabecalho =
    `📊 *Resumo do Dia — ${noAutoLink(hoje)}*\n\n` +
    `*Notas de venda:* ${noAutoLink(String(saleCount))}\n` +
    `*Valor de vendas:* ${noAutoLink(formatBRL(saleTotal))}\n` +
    '━━━━━━━━━━━━━━━━━━';
  const contHeader = `📊 *Resumo do Dia — ${noAutoLink(hoje)}* (continuação)\n━━━━━━━━━━━━━━━━━━`;
  const rodape = `━━━━━━━━━━━━━━━━━━\n\n🔗 Abrir todas as notas do dia:\n${linkDia}`;

  const mensagens: string[] = [];
  let buffer = cabecalho;
  for (const inv of invoices) {
    const bloco = linhaNota(inv, nicknames);
    if (`${buffer}\n${bloco}`.length > DAILY_SUMMARY_MAX_MSG) {
      mensagens.push(buffer);
      buffer = `${contHeader}\n${bloco}`;
    } else {
      buffer += `\n${bloco}`;
    }
  }
  mensagens.push(buffer);
  mensagens[mensagens.length - 1] += `\n${rodape}`;

  const items: DailySummaryMessage[] = [];
  for (const jid of recipients) {
    for (const text of mensagens) {
      items.push({ jid, text });
    }
  }
  return items;
}
