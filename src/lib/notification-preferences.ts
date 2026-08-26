import type { NotificationEventType } from '@prisma/client';

/**
 * Padrão de cada tipo de notificação, quando o usuário nunca escolheu.
 *
 * FONTE ÚNICA. Antes desta feature o padrão vivia duplicado como literal em
 * PreferencesSection.tsx; tela e outbox agora leem daqui.
 *
 * `invoice_received: true` preserva o comportamento anterior — nenhum usuário
 * existente perde notificação por causa da feature, e usuário criado depois
 * nasce ligado sem precisar de linha semeada (SPEC-010 A2).
 *
 * Record completo de propósito: um valor novo em NotificationEventType sem
 * padrão declarado aqui deixa de compilar. É a invariante 6 do data-model,
 * cobrada pelo TypeScript antes de chegar a teste.
 */
export const NOTIFICATION_PREFERENCE_DEFAULTS: Record<NotificationEventType, boolean> = {
  invoice_received: true,
};

/** Linha de preferência, reduzida ao que a decisão precisa. */
export interface NotificationPreferenceRow {
  eventType: NotificationEventType;
  enabled: boolean;
}

/**
 * Valor efetivo de uma preferência: o da linha se existir, senão o padrão.
 *
 * Não há terceiro estado. Ausência nunca significa "desligado".
 */
export function resolvePreference(
  eventType: NotificationEventType,
  rows: ReadonlyArray<NotificationPreferenceRow>,
): boolean {
  const row = rows.find((r) => r.eventType === eventType);
  return row ? row.enabled : NOTIFICATION_PREFERENCE_DEFAULTS[eventType];
}

/**
 * O usuário quer receber este tipo de notificação?
 *
 * Pura de propósito: recebe as preferências já carregadas e não toca no banco,
 * para poder ser exercitada sem infraestrutura.
 *
 * Responde VONTADE, não permissão. A pergunta de autorização continua sendo de
 * canReceiveInvoiceNotifications, e as duas são compostas pelo chamador — ver
 * decisão D2 do plano. Fundi-las faria um defeito de preferência virar
 * vazamento de autorização.
 */
export function wantsNotification(
  user: { notificationPreferences?: ReadonlyArray<NotificationPreferenceRow> | null },
  eventType: NotificationEventType,
): boolean {
  return resolvePreference(eventType, user.notificationPreferences ?? []);
}

/**
 * Preferências efetivas de todos os tipos, para a rota de leitura.
 *
 * A lista nunca vem parcial: percorre o enum inteiro, então um tipo novo
 * aparece na tela sozinho, sem a interface precisar conhecê-lo.
 */
export function listEffectivePreferences(
  rows: ReadonlyArray<NotificationPreferenceRow>,
): Array<{ eventType: NotificationEventType; enabled: boolean; isDefault: boolean }> {
  return (Object.keys(NOTIFICATION_PREFERENCE_DEFAULTS) as NotificationEventType[]).map(
    (eventType) => {
      const row = rows.find((r) => r.eventType === eventType);
      return {
        eventType,
        enabled: row ? row.enabled : NOTIFICATION_PREFERENCE_DEFAULTS[eventType],
        isDefault: !row,
      };
    },
  );
}
