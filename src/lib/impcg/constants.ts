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

export const IMPCG_PARSE_RANK = {
  falha: 0,
  parcial: 1,
  ok: 2,
} as const;

export type ImpcgParseStatus = keyof typeof IMPCG_PARSE_RANK;
