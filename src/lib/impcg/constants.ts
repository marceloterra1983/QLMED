export const IMPCG_SENDER_EMAIL = 'compras.impcg@gmail.com';

export const IMPCG_MAILBOXES = [
  'marcelo@qlmed.com.br',
  'flavio@qlmed.com.br',
] as const;

export const IMPCG_ONEDRIVE_FOLDER = '1 - DOCUMENTOS/0 - AUTORIZACOES/IMPCG';

export const IMPCG_ONEDRIVE_ACCOUNT = 'faturamento@qlmed.com.br';

export const IMPCG_PAGE_PATH = '/gestao/impcg';

export const IMPCG_INGEST_INTERVAL_MS = 15 * 60 * 1000;

export const IMPCG_MAILBOX_TIMEOUT_MS = 30_000;

/**
 * A coleta varre o histórico completo da caixa (mensagens desde 2018), então
 * "mensagem processada" não basta para avisar no WhatsApp: sem esta janela um
 * backfill dispararia centenas de envios de ofícios antigos (SPEC-031 FR-005).
 */
export const IMPCG_NOTIFY_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function isImpcgWhatsAppEnabled(): boolean {
  return (process.env.IMPCG_WHATSAPP_ENABLED ?? '').toLowerCase() === 'true';
}

/**
 * Destino próprio do IMPCG, separado do grupo fiscal, para o envio de
 * homologação ir a um grupo de teste sem atingir o grupo de produção.
 */
export function getImpcgWhatsAppGroupRaw(): string | null {
  return (
    process.env.IMPCG_WHATSAPP_GROUP_JID
    ?? process.env.NOTIFICATION_WHATSAPP_GROUP
    ?? process.env.QLMED_WHATSAPP_GROUP_JID
    ?? null
  );
}

export const IMPCG_PARSE_RANK = {
  falha: 0,
  parcial: 1,
  ok: 2,
} as const;

export type ImpcgParseStatus = keyof typeof IMPCG_PARSE_RANK;
