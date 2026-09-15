import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findManyProducts: vi.fn(),
  findManyMovements: vi.fn(),
  update: vi.fn(),
  createMany: vi.fn(),
  transaction: vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
}));

vi.mock('@/lib/prisma', () => ({
  default: {
    productRegistry: {
      findMany: mocks.findManyProducts,
      update: mocks.update,
      createMany: mocks.createMany,
    },
    stockMovement: {
      findMany: mocks.findManyMovements,
    },
    $transaction: mocks.transaction,
  },
}));

import {
  buildCanonicalSpicaProductKey,
  processSpicaRows,
  resolveSpicaOutOfLine,
} from '@/lib/spica/import-service';

describe('spica/import-service', () => {
  beforeEach(() => {
    mocks.findManyProducts.mockReset();
    mocks.findManyMovements.mockReset();
    mocks.update.mockReset().mockResolvedValue({});
    mocks.createMany.mockReset().mockResolvedValue({ count: 0 });
    mocks.transaction.mockImplementation(async (ops: Promise<unknown>[]) => Promise.all(ops));
  });

  it('sem nota de compra fica fora de linha, mesmo que a planilha diga em linha', () => {
    expect(resolveSpicaOutOfLine(false, false)).toBe(true);
    expect(resolveSpicaOutOfLine(false, true)).toBe(false);
    expect(resolveSpicaOutOfLine(true, true)).toBe(true);
  });

  it('gera chave CODE:REF::UNIT:UN para referencias unicas e validas', () => {
    const key = buildCanonicalSpicaProductKey('BBXX01A-RK', '007550', true);
    expect(key).toBe('CODE:BBXX01A-RK::UNIT:UN');
  });

  it('gera chave SPICA:CODIGO quando referencia for duplicada', () => {
    const key = buildCanonicalSpicaProductKey('PROCAT', '004235', false);
    expect(key).toBe('SPICA:004235');
  });

  it('gera chave SPICA:CODIGO quando referencia for _ ou vazia', () => {
    expect(buildCanonicalSpicaProductKey('_', '005267', true)).toBe('SPICA:005267');
    expect(buildCanonicalSpicaProductKey('', '001234', true)).toBe('SPICA:001234');
  });

  it('processSpicaRows marca fora de linha quando não há ENTRADA received', async () => {
    mocks.findManyProducts.mockResolvedValue([
      {
        id: 'p1',
        productKey: 'CODE:REF1::UNIT:UN',
        code: 'REF1',
        codigo: '007493',
        description: 'Antigo',
        anvisaCode: null,
        anvisaSource: null,
        productRefs: ['REF1'],
        fiscalSitTributaria: null,
      },
    ]);
    mocks.findManyMovements.mockResolvedValue([]);

    await processSpicaRows(
      [
        {
          codigo: '007493',
          referencia: 'REF1',
          nome: 'Produto',
          tipo: '4 - OUTROS',
          subtipo: 'OUTROS',
          fabricante: 'X',
          instrumental: 'Não',
          rvs: '',
          ncm: '1234',
          sitTributaria: '000',
          nomeTributacao: '',
          icms: '0',
          pis: '0',
          cofins: '0',
          ipiEntrada: '0',
        },
      ],
      { companyId: 'co1', dryRun: false },
    );

    expect(mocks.findManyMovements).toHaveBeenCalled();
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'p1' },
        data: expect.objectContaining({ outOfLine: true, productSubtype: 'Sem grupo' }),
      }),
    );
  });

  it('processSpicaRows mantém em linha quando há ENTRADA received do código', async () => {
    mocks.findManyProducts.mockResolvedValue([
      {
        id: 'p2',
        productKey: 'CODE:REF2::UNIT:UN',
        code: 'REF2',
        codigo: '001001',
        description: 'Antigo',
        anvisaCode: null,
        anvisaSource: null,
        productRefs: ['REF2'],
        fiscalSitTributaria: null,
      },
    ]);
    mocks.findManyMovements.mockResolvedValue([{ productCodigo: '001001' }]);

    await processSpicaRows(
      [
        {
          codigo: '001001',
          referencia: 'REF2',
          nome: 'Produto 2',
          tipo: '3 - ORTOPEDIA',
          subtipo: 'ALEXIS',
          fabricante: 'Y',
          instrumental: 'Não',
          rvs: '',
          ncm: '1234',
          sitTributaria: '000',
          nomeTributacao: '',
          icms: '0',
          pis: '0',
          cofins: '0',
          ipiEntrada: '0',
        },
      ],
      { companyId: 'co1', dryRun: false },
    );

    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ outOfLine: false }),
      }),
    );
  });
});
