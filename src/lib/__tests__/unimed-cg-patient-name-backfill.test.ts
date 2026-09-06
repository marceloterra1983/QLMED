import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/prisma', () => {
  const auth = {
    findMany: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  };
  const delivery = {
    findMany: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  };
  const pre = {
    findMany: vi.fn(),
    update: vi.fn(),
  };
  const reversal = {
    findMany: vi.fn(),
  };
  return {
    default: {
      unimedCgAuthorization: auth,
      unimedCgDeliveryAuthorization: delivery,
      unimedCgPreSolicitation: pre,
      unimedCgProcessReversal: reversal,
    },
  };
});

import prisma from '@/lib/prisma';
import { backfillMissingUnimedCgPatientNames } from '@/lib/unimed-cg/backfill-patient-names';

describe('unimed-cg patientName backfill', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('copia Beneficiário da reversão para autorização com patientName null', async () => {
    vi.mocked(prisma.unimedCgProcessReversal.findMany).mockResolvedValue([
      { processId: '75576', patientName: 'DIEGO ABEL DA SILVA' },
    ] as never);
    vi.mocked(prisma.unimedCgAuthorization.updateMany).mockResolvedValue({ count: 1 } as never);
    vi.mocked(prisma.unimedCgDeliveryAuthorization.updateMany).mockResolvedValue({ count: 0 } as never);
    vi.mocked(prisma.unimedCgAuthorization.findMany).mockResolvedValue([]);
    vi.mocked(prisma.unimedCgDeliveryAuthorization.findMany).mockResolvedValue([]);
    vi.mocked(prisma.unimedCgPreSolicitation.findMany).mockResolvedValue([]);

    const fetchBeneficiario = vi.fn();
    const result = await backfillMissingUnimedCgPatientNames({
      companyId: 'co1',
      fetchBeneficiario,
      limitPerKind: 5,
    });

    expect(result.copiedFromRelated).toBe(1);
    expect(fetchBeneficiario).not.toHaveBeenCalled();
    expect(prisma.unimedCgAuthorization.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ processId: '75576' }),
        data: { patientName: 'DIEGO ABEL DA SILVA' },
      }),
    );
  });

  it('busca no portal quando ainda falta patientName', async () => {
    vi.mocked(prisma.unimedCgProcessReversal.findMany).mockResolvedValue([]);
    vi.mocked(prisma.unimedCgAuthorization.findMany).mockResolvedValue([
      { id: 'a1', processId: '36972' },
    ] as never);
    vi.mocked(prisma.unimedCgDeliveryAuthorization.findMany).mockResolvedValue([]);
    vi.mocked(prisma.unimedCgPreSolicitation.findMany).mockResolvedValue([]);
    vi.mocked(prisma.unimedCgAuthorization.update).mockResolvedValue({} as never);

    const fetchBeneficiario = vi.fn().mockResolvedValue('NOME TESTE');
    const result = await backfillMissingUnimedCgPatientNames({
      companyId: 'co1',
      fetchBeneficiario,
      limitPerKind: 5,
    });

    expect(result.updatedFromPortal).toBe(1);
    expect(fetchBeneficiario).toHaveBeenCalledWith('36972');
    expect(prisma.unimedCgAuthorization.update).toHaveBeenCalledWith({
      where: { id: 'a1' },
      data: { patientName: 'NOME TESTE' },
    });
  });
});
