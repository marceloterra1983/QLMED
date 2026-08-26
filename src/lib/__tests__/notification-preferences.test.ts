import { describe, it, expect } from 'vitest';
import {
  NOTIFICATION_PREFERENCE_DEFAULTS,
  resolvePreference,
  wantsNotification,
  listEffectivePreferences,
} from '@/lib/notification-preferences';

describe('NOTIFICATION_PREFERENCE_DEFAULTS', () => {
  // Invariante 6 do data-model: percorre o enum, não lista valores à mão —
  // senão não pega o tipo que alguém acrescentar amanhã.
  it('declara padrão para todo tipo de evento conhecido', () => {
    const declared = Object.keys(NOTIFICATION_PREFERENCE_DEFAULTS);
    expect(declared.length).toBeGreaterThan(0);
    for (const eventType of declared) {
      expect(typeof NOTIFICATION_PREFERENCE_DEFAULTS[eventType as 'invoice_received']).toBe('boolean');
    }
  });

  it('mantém invoice_received ligado — preserva o comportamento anterior (FR-003)', () => {
    expect(NOTIFICATION_PREFERENCE_DEFAULTS.invoice_received).toBe(true);
  });
});

describe('resolvePreference', () => {
  it('sem linha, resolve para o padrão do tipo', () => {
    expect(resolvePreference('invoice_received', [])).toBe(true);
  });

  it('com linha, o valor da linha manda sobre o padrão', () => {
    expect(resolvePreference('invoice_received', [{ eventType: 'invoice_received', enabled: false }])).toBe(false);
  });

  it('ignora linha de outro tipo ao resolver', () => {
    // Blindagem contra "pegou a primeira linha do array" em vez de casar o tipo.
    const rows = [{ eventType: 'invoice_received' as const, enabled: false }];
    expect(resolvePreference('invoice_received', rows)).toBe(false);
    expect(resolvePreference('invoice_received', [])).toBe(true);
  });
});

describe('wantsNotification', () => {
  it('usuário que nunca escolheu quer receber', () => {
    expect(wantsNotification({}, 'invoice_received')).toBe(true);
  });

  it('usuário com preferências nulas cai no padrão, sem estourar', () => {
    expect(wantsNotification({ notificationPreferences: null }, 'invoice_received')).toBe(true);
  });

  it('usuário que desligou não quer receber', () => {
    const user = { notificationPreferences: [{ eventType: 'invoice_received' as const, enabled: false }] };
    expect(wantsNotification(user, 'invoice_received')).toBe(false);
  });

  it('distingue ligado de desligado — reprova se virar constante', () => {
    const on = { notificationPreferences: [{ eventType: 'invoice_received' as const, enabled: true }] };
    const off = { notificationPreferences: [{ eventType: 'invoice_received' as const, enabled: false }] };
    expect(wantsNotification(on, 'invoice_received')).not.toBe(wantsNotification(off, 'invoice_received'));
  });
});

describe('listEffectivePreferences', () => {
  it('nunca vem parcial: cobre todos os tipos do enum', () => {
    const list = listEffectivePreferences([]);
    expect(list.length).toBe(Object.keys(NOTIFICATION_PREFERENCE_DEFAULTS).length);
  });

  it('marca isDefault quando não há linha gravada', () => {
    const [row] = listEffectivePreferences([]);
    expect(row.isDefault).toBe(true);
    expect(row.enabled).toBe(true);
  });

  it('marca isDefault falso e usa o valor gravado quando há linha', () => {
    const list = listEffectivePreferences([{ eventType: 'invoice_received', enabled: false }]);
    const row = list.find((r) => r.eventType === 'invoice_received');
    expect(row?.isDefault).toBe(false);
    expect(row?.enabled).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Composição permissão × vontade, sem banco.
//
// Existe porque o portão de reversão (T019) revelou que desfazer a composição
// no outbox deixava a suíte VERDE: o teste de integração que a cobriria fica
// `skipped` sem RUN_DB_INTEGRATION_TESTS. Sem estes casos, remover a
// preferência do filtro passaria despercebido.
// ---------------------------------------------------------------------------
describe('selectNotifiableUsers', () => {
  const admin = { role: 'admin', allowedPages: [] as string[] };

  it('inclui quem pode e nunca escolheu (padrão ligado)', async () => {
    const { selectNotifiableUsers } = await import('@/lib/notification-outbox');
    expect(selectNotifiableUsers([admin], 'NFE')).toHaveLength(1);
  });

  it('exclui quem pode mas desligou a preferência', async () => {
    const { selectNotifiableUsers } = await import('@/lib/notification-outbox');
    const optedOut = {
      ...admin,
      notificationPreferences: [{ eventType: 'invoice_received' as const, enabled: false }],
    };
    expect(selectNotifiableUsers([optedOut], 'NFE')).toHaveLength(0);
  });

  it('preferência é individual: desligar um não afeta o outro', async () => {
    const { selectNotifiableUsers } = await import('@/lib/notification-outbox');
    const optedOut = {
      ...admin,
      notificationPreferences: [{ eventType: 'invoice_received' as const, enabled: false }],
    };
    const result = selectNotifiableUsers([optedOut, admin], 'NFE');
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(admin);
  });

  it('exclui quem não tem permissão, mesmo querendo receber', async () => {
    const { selectNotifiableUsers } = await import('@/lib/notification-outbox');
    const semAcesso = {
      role: 'viewer',
      allowedPages: ['/cadastro/produtos'],
      notificationPreferences: [{ eventType: 'invoice_received' as const, enabled: true }],
    };
    expect(selectNotifiableUsers([semAcesso], 'NFE')).toHaveLength(0);
  });

  it('as duas condições são independentes — reprova se uma sumir do filtro', async () => {
    const { selectNotifiableUsers } = await import('@/lib/notification-outbox');
    const podeEQuer = admin;
    const podeNaoQuer = {
      ...admin,
      notificationPreferences: [{ eventType: 'invoice_received' as const, enabled: false }],
    };
    const naoPodeQuer = { role: 'viewer', allowedPages: ['/cadastro/produtos'] };
    expect(selectNotifiableUsers([podeEQuer, podeNaoQuer, naoPodeQuer], 'NFE')).toHaveLength(1);
  });
});
