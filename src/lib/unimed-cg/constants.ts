export const UNIMED_CG_SENDER_EMAIL = 'naoresponda.unimedcg@opmes.com.br';

export const UNIMED_CG_MAILBOXES = [
  'marcelo@qlmed.com.br',
  'flavio@qlmed.com.br',
] as const;

export const UNIMED_CG_ONEDRIVE_FOLDER = '1 - DOCUMENTOS/0 - AUTORIZACOES/UNIMED-CG';

export const UNIMED_CG_ONEDRIVE_ACCOUNT = 'faturamento@qlmed.com.br';

export const UNIMED_CG_PAGE_PATH = '/gestao/unimed-cg';

export const UNIMED_CG_INGEST_INTERVAL_MS = 15 * 60 * 1000;

export const UNIMED_CG_MAILBOX_TIMEOUT_MS = 30_000;

export const UNIMED_CG_NOTIFY_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** Hosts permitidos para fetch HTML / Puppeteer da página OPME. */
export const UNIMED_CG_OPME_HOSTS = ['unimedcg.opmes.com.br'] as const;

/**
 * Assunto canônico: `[ID N] [OPME] autorização de faturamento do processo`
 * (acentos opcionais; N = processId).
 */
export const UNIMED_CG_SUBJECT_RE =
  /\[ID\s+(\d+)\]\s*\[OPME\]\s*autoriza[cç][aã]o\s+de\s+faturamento\s+do\s+processo/i;


/**
 * Assunto entrega: `[ID N] [OPME] etapa de autorização concluída`
 * (acentos opcionais; N = processId).
 */
export const UNIMED_CG_ENTREGA_SUBJECT_RE =
  /\[ID\s+(\d+)\]\s*\[OPME\]\s*etapa\s+de\s+autoriza[cç][aã]o\s+conclu[ií]da/i;


/**
 * Assunto reversão: `[ID N] [OPME] Reversão de Processo`
 */
export const UNIMED_CG_REVERSAO_SUBJECT_RE =
  /\[ID\s+(\d+)\]\s*\[OPME\]\s*Revers[aã]o\s+de\s+Processo/i;

/**
 * Assunto pré-solicitação: `[OPME] solicitação para completar dados da pré-solicitação [Eletivo|Urgente]?`
 */
export const UNIMED_CG_PRE_SOLICITACAO_SUBJECT_RE =
  /\[OPME\]\s*solicita[cç][aã]o\s+para\s+completar\s+dados\s+da\s+pr[eé]-solicita[cç][aã]o(?:\s*\[(Eletivo|Urgente)\])?/i;

/**
 * Assunto prazo NF: `[ID N] [OPME]` + `prazo para lançamento da Nota Fiscal`
 */
export const UNIMED_CG_PRAZO_NF_SUBJECT_RE =
  /\[ID\s+(\d+)\]\s*\[OPME\][\s\S]*prazo\s+para\s+lan[cç]amento\s+da\s+Nota\s+Fiscal/i;

/**
 * Assunto OC SOULMV: "Ordem de compra(s) 188246 - ..."
 * Remetente: qualquer *@unimedcg.coop.br (não o portal OPME).
 */
export const UNIMED_CG_ORDEM_COMPRA_SENDER_DOMAIN = 'unimedcg.coop.br';

/** Confirmação GTPlan (PDF unimedcg_{oc}.pdf), distinto do SOULMV @unimedcg.coop.br. */
export const UNIMED_CG_ORDEM_COMPRA_GTPLAN_SENDER = 'no-reply@gtplan.net';

export const UNIMED_CG_ORDEM_COMPRA_SENDERS = [
  UNIMED_CG_ORDEM_COMPRA_SENDER_DOMAIN,
  UNIMED_CG_ORDEM_COMPRA_GTPLAN_SENDER,
] as const;

export const UNIMED_CG_ORDEM_COMPRA_SUBJECT_RE = /ordem\s+de\s+compras?/i;

export function isUnimedCgWhatsAppEnabled(): boolean {
  return (process.env.UNIMED_CG_WHATSAPP_ENABLED ?? '').toLowerCase() === 'true';
}

export function getUnimedCgWhatsAppGroupRaw(): string | null {
  return process.env.UNIMED_CG_WHATSAPP_GROUP_JID ?? null;
}

/** Canal só da OC. Não reutiliza o grupo/flag das autorizações OPME. */
export function isUnimedCgOcWhatsAppEnabled(): boolean {
  return (process.env.UNIMED_CG_OC_WHATSAPP_ENABLED ?? '').toLowerCase() === 'true';
}

export function getUnimedCgOcWhatsAppGroupRaw(): string | null {
  return process.env.UNIMED_CG_OC_WHATSAPP_GROUP_JID ?? null;
}

export const UNIMED_CG_PARSE_RANK = {
  falha: 0,
  parcial: 1,
  ok: 2,
} as const;

export type UnimedCgParseStatus = keyof typeof UNIMED_CG_PARSE_RANK;

/** CNPJ destinatário Unimed CG (só dígitos) para match de faturamento NF-e. */
export const UNIMED_CG_BILLING_RECIPIENT_CNPJ = '03315918000118';

export type UnimedCgBilledMatchStatus = 'matched' | 'ambiguous';
