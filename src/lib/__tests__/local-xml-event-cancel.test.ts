import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyLocalXmlCancellation } from '../local-xml-sync/apply-event-xml';

const CHAVE = '35241012345678000199550010000012341123456789';

const { updateMany } = vi.hoisted(() => ({
  updateMany: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    invoice: { updateMany },
  },
}));

const PROC_EVENTO = `<?xml version="1.0" encoding="UTF-8"?>
<procEventoNFe versao="1.00">
  <evento versao="1.00">
    <infEvento>
      <chNFe>${CHAVE}</chNFe>
      <dhEvento>2026-08-20T14:00:00-03:00</dhEvento>
      <tpEvento>110111</tpEvento>
    </infEvento>
  </evento>
  <retEvento versao="1.00">
    <infEvento>
      <tpEvento>110111</tpEvento>
      <chNFe>${CHAVE}</chNFe>
      <cStat>135</cStat>
      <dhRegEvento>2026-08-20T14:30:00-03:00</dhRegEvento>
    </infEvento>
  </retEvento>
</procEventoNFe>`;

describe('applyLocalXmlCancellation', () => {
  beforeEach(() => {
    updateMany.mockReset();
    updateMany.mockResolvedValue({ count: 1 });
  });

  it('marca a nota existente a partir do XML de evento no nome do arquivo', async () => {
    const applied = await applyLocalXmlCancellation(
      'company-1',
      PROC_EVENTO,
      `/backup/2026_08/${CHAVE}-nfe.xml`,
    );
    expect(applied).toBe(true);
    expect(updateMany).toHaveBeenCalledTimes(1);
    const arg = updateMany.mock.calls[0][0] as {
      where: { accessKey: string; cancelledAt: null };
      data: Record<string, unknown>;
    };
    expect(arg.where).toEqual({ companyId: 'company-1', accessKey: CHAVE, cancelledAt: null });
    expect(arg.data).not.toHaveProperty('xmlContent');
  });

  it('nao inventa cancelamento em XML autorizado sem evento', async () => {
    const applied = await applyLocalXmlCancellation(
      'company-1',
      '<?xml version="1.0"?><nfeProc><NFe><infNFe Id="NFe35241012345678000199550010000012341123456789"></infNFe></NFe></nfeProc>',
      `/backup/${CHAVE}-nfe.xml`,
    );
    expect(applied).toBe(false);
    expect(updateMany).not.toHaveBeenCalled();
  });
});
