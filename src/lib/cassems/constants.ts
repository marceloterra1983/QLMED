export const CASSEMS_SENDER_EMAIL = 'oficio.cconecte@cassems.com.br';

export const CASSEMS_MAILBOXES = ['joseroberto@qlmed.com.br'] as const;

export const CASSEMS_ONEDRIVE_FOLDER = '1 - DOCUMENTOS/0 - AUTORIZACOES/CASSEMS';

export const CASSEMS_ONEDRIVE_ACCOUNT = 'faturamento@qlmed.com.br';

export const CASSEMS_PAGE_PATH = '/gestao/cassems';

export const CASSEMS_INGEST_INTERVAL_MS = 15 * 60 * 1000;

export const CASSEMS_MAILBOX_TIMEOUT_MS = 30_000;

export const CASSEMS_PARSE_RANK = {
  falha: 0,
  parcial: 1,
  ok: 2,
} as const;

export type CassemsParseStatus = keyof typeof CASSEMS_PARSE_RANK;
