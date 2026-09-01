export const CASSEMS_SENDER_EMAIL = 'oficio.cconecte@cassems.com.br';

/** SPEC-036: ofício antigo permanece; OPME é adicional (endereço confirmado no Graph). */
export const CASSEMS_SENDER_EMAILS = [
  CASSEMS_SENDER_EMAIL,
  'mailing.opme@cassems.com.br',
] as const;

export const CASSEMS_MAILBOXES = ['joseroberto@qlmed.com.br'] as const;

export const CASSEMS_ONEDRIVE_FOLDER = '1 - DOCUMENTOS/0 - AUTORIZACOES/CASSEMS';

export const CASSEMS_ONEDRIVE_ACCOUNT = 'faturamento@qlmed.com.br';

export const CASSEMS_PAGE_PATH = '/gestao/cassems';

export const CASSEMS_INGEST_INTERVAL_MS = 15 * 60 * 1000;

/** Orçamento de UMA requisição Graph, aplicado por `perRequestSignal`. */
export const CASSEMS_MAILBOX_TIMEOUT_MS = 30_000;

/**
 * A coleta varre o histórico completo da caixa (mensagens do remetente desde
 * 2014), então "mensagem processada" não basta para avisar no WhatsApp: sem
 * esta janela um backfill dispararia milhares de envios (SPEC-034 FR-005).
 */
export const CASSEMS_NOTIFY_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function isCassemsWhatsAppEnabled(): boolean {
  return (process.env.CASSEMS_WHATSAPP_ENABLED ?? '').toLowerCase() === 'true';
}

/**
 * Destino próprio do CASSEMS, separado do grupo fiscal e do IMPCG, para o envio
 * de homologação ir a um grupo de teste sem atingir o grupo de produção.
 */
export function getCassemsWhatsAppGroupRaw(): string | null {
  return (
    // Sem fallback para os grupos partilhados, de propósito. Os dois que
    // estavam aqui — NOTIFICATION_WHATSAPP_GROUP e QLMED_WHATSAPP_GROUP_JID —
    // são o grupo FISCAL. Com a variável própria ausente e o canal ligado, o
    // ofício ia para lá com nome do paciente, matrícula, CRM e o PDF clínico
    // anexo. O comentário acima já dizia "separado do grupo fiscal"; o código
    // fazia o contrário. Sem destino próprio, o canal fica desligado.
    process.env.CASSEMS_WHATSAPP_GROUP_JID ?? null
  );
}

export const CASSEMS_PARSE_RANK = {
  falha: 0,
  parcial: 1,
  ok: 2,
} as const;

export type CassemsParseStatus = keyof typeof CASSEMS_PARSE_RANK;
