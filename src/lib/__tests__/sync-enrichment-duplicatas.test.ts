import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  deleteMany: vi.fn(),
  createMany: vi.fn(),
  $transaction: vi.fn(async (cb) => cb({
    invoiceDuplicata: {
      deleteMany: mocks.deleteMany,
      createMany: mocks.createMany,
    },
  })),
}));

vi.mock('@/lib/prisma', () => ({
  default: {
    $transaction: mocks.$transaction,
    invoiceDuplicata: {
      deleteMany: mocks.deleteMany,
      createMany: mocks.createMany,
    },
  },
}));

import { extractAndStoreDuplicatas } from '@/lib/invoice-duplicata-store';

const XML_WITH_DUPLICATAS = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe">
  <NFe>
    <infNFe>
      <cobr>
        <fat>
          <nFat>12345</nFat>
          <vOrig>1000.00</vOrig>
          <vLiq>1000.00</vLiq>
        </fat>
        <dup>
          <nDup>001</nDup>
          <dVenc>2026-10-15</dVenc>
          <vDup>500.00</vDup>
        </dup>
        <dup>
          <nDup>002</nDup>
          <dVenc>2026-11-15</dVenc>
          <vDup>500.00</vDup>
        </dup>
      </cobr>
    </infNFe>
  </NFe>
</nfeProc>`;

const XML_WITHOUT_DUPLICATAS = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe">
  <NFe>
    <infNFe>
      <ide><nNF>999</nNF></ide>
    </infNFe>
  </NFe>
</nfeProc>`;

describe('G5 — Ingest enrichment with duplicata extraction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('extracts and persists all duplicatas from XML into invoice_duplicata', async () => {
    await extractAndStoreDuplicatas('inv-1', 'comp-1', XML_WITH_DUPLICATAS);

    expect(mocks.deleteMany).toHaveBeenCalledWith({ where: { invoiceId: 'inv-1' } });
    expect(mocks.createMany).toHaveBeenCalled();
    const createdData = mocks.createMany.mock.calls[0][0].data;
    expect(createdData).toHaveLength(2);
    expect(createdData[0].dupNumero).toBe('001');
    expect(createdData[0].dupVencimento).toBe('2026-10-15');
    expect(createdData[0].dupValor).toBe(500);
    expect(createdData[1].dupNumero).toBe('002');
    expect(createdData[1].dupVencimento).toBe('2026-11-15');
    expect(createdData[1].dupValor).toBe(500);
  });

  it('persists a sentinel __NONE__ row when invoice XML has no duplicatas', async () => {
    await extractAndStoreDuplicatas('inv-2', 'comp-1', XML_WITHOUT_DUPLICATAS);

    expect(mocks.createMany).toHaveBeenCalled();
    const createdData = mocks.createMany.mock.calls[0][0].data;
    expect(createdData).toHaveLength(1);
    expect(createdData[0].dupNumero).toBe('__NONE__');
    expect(createdData[0].dupVencimento).toBe('__NONE__');
    expect(createdData[0].invoiceId).toBe('inv-2');
  });
});
