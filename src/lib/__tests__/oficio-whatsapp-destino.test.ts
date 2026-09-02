/**
 * REAUD-B-05 / QLMED-PRIV-001. O `minimalRemediation` do finding dizia "não
 * misturar JID fiscal" — e nenhuma folha o reclamou, porque eu tinha posto o
 * finding inteiro fora de escopo como "aceito pelo dono". A parte aceita é o
 * envio de PHI por WhatsApp; mandá-lo para o grupo ERRADO nunca foi aceito.
 */
import { afterEach, describe, expect, it } from 'vitest';

const VARS = [
  'IMPCG_WHATSAPP_GROUP_JID',
  'CASSEMS_WHATSAPP_GROUP_JID',
  'NOTIFICATION_WHATSAPP_GROUP',
  'QLMED_WHATSAPP_GROUP_JID',
];

afterEach(() => {
  for (const v of VARS) delete process.env[v];
});

async function destinos() {
  const impcg = await import('@/lib/impcg/constants');
  const cassems = await import('@/lib/cassems/constants');
  return {
    impcg: impcg.getImpcgWhatsAppGroupRaw(),
    cassems: cassems.getCassemsWhatsAppGroupRaw(),
  };
}

describe('destino do WhatsApp de ofício', () => {
  it('sem destino próprio, o canal fica DESLIGADO mesmo com o grupo fiscal configurado', async () => {
    process.env.NOTIFICATION_WHATSAPP_GROUP = 'grupo-fiscal@g.us';
    process.env.QLMED_WHATSAPP_GROUP_JID = 'grupo-fiscal@g.us';

    const { impcg, cassems } = await destinos();

    expect(impcg).toBeNull();
    expect(cassems).toBeNull();
  });

  it('com destino próprio, usa o próprio e ignora o fiscal', async () => {
    process.env.NOTIFICATION_WHATSAPP_GROUP = 'grupo-fiscal@g.us';
    process.env.IMPCG_WHATSAPP_GROUP_JID = 'grupo-impcg@g.us';
    process.env.CASSEMS_WHATSAPP_GROUP_JID = 'grupo-cassems@g.us';

    const { impcg, cassems } = await destinos();

    expect(impcg).toBe('grupo-impcg@g.us');
    expect(cassems).toBe('grupo-cassems@g.us');
  });
});
