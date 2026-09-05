import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildUnimedCgDeliveryWhatsAppCaption,
  buildUnimedCgWhatsAppCaption,
  isWithinUnimedCgNotifyWindow,
  resolveUnimedCgWhatsAppTarget,
} from '@/lib/unimed-cg/whatsapp-notify';

describe('unimed-cg whatsapp', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('monta caption do plano', () => {
    const caption = buildUnimedCgWhatsAppCaption({
      processId: '75576',
      authorizationNumber: '260291512',
      location: 'UNIMED CAMPO GRANDE MS COOP TRAB MED',
      totalCents: 528900,
    });
    expect(caption).toContain('Autorização Unimed CG — Processo 75576');
    expect(caption).toContain('Autorização: 260291512');
    expect(caption).toContain('Local: UNIMED CAMPO GRANDE MS COOP TRAB MED');
    expect(caption).toContain('Valor total: R$ 5.289,00');
  });

  it('janela de 7 dias', () => {
    const now = new Date('2026-09-05T12:00:00Z');
    expect(isWithinUnimedCgNotifyWindow(new Date('2026-09-01T12:00:00Z'), now)).toBe(true);
    expect(isWithinUnimedCgNotifyWindow(new Date('2026-08-01T12:00:00Z'), now)).toBe(false);
  });

  it('target só com env próprio (sem fallback fiscal)', () => {
    vi.stubEnv('UNIMED_CG_WHATSAPP_ENABLED', 'true');
    vi.stubEnv('UNIMED_CG_WHATSAPP_GROUP_JID', '');
    vi.stubEnv('NOTIFICATION_WHATSAPP_GROUP', '120363999@g.us');
    expect(resolveUnimedCgWhatsAppTarget({ baseUrl: 'http://x', apiKey: 'k', instance: 'i' })).toBeNull();

    vi.stubEnv('UNIMED_CG_WHATSAPP_GROUP_JID', '120363111111111111@g.us');
    const target = resolveUnimedCgWhatsAppTarget({ baseUrl: 'http://x', apiKey: 'k', instance: 'i' });
    expect(target?.jid).toBe('120363111111111111@g.us');
  });

  it('monta caption de entrega', () => {
    const caption = buildUnimedCgDeliveryWhatsAppCaption({
      processId: '81234',
      principalAuthorization: '260312345',
      status: 'Autorizado',
      supplier: 'QL MED',
    });
    expect(caption).toContain('Autorização Unimed CG (entrega) — Processo 81234');
    expect(caption).toContain('Autorização principal: 260312345');
    expect(caption).toContain('Situação: Autorizado');
    expect(caption).toContain('Fornecedor: QL MED');
  });
});
