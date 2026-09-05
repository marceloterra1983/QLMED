import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  // invoice-tax
  taxTotalsUpsert: vi.fn(),
  taxTotalsFindUnique: vi.fn(),
  itemTaxDeleteMany: vi.fn(),
  itemTaxCreateMany: vi.fn(),
  itemTaxFindMany: vi.fn(),
  // contact-fiscal
  contactFiscalFindUnique: vi.fn(),
  contactFiscalCreate: vi.fn(),
  contactFiscalUpdate: vi.fn(),
  // invoice-duplicata
  $transaction: vi.fn(),
  duplicataDeleteMany: vi.fn(),
  duplicataCreateMany: vi.fn(),
  // product-registry
  productRegistryFindUnique: vi.fn(),
  productRegistryFindMany: vi.fn(),
  productRegistryCreate: vi.fn(),
  productRegistryUpdate: vi.fn(),
  // ncm
  ncmCacheFindUnique: vi.fn(),
  ncmCacheUpsert: vi.fn(),
  ncmCacheFindMany: vi.fn(),
  // stock-entry
  stockEntryFindUnique: vi.fn(),
  stockEntryCreate: vi.fn(),
  stockEntryUpdate: vi.fn(),
  // product-settings-catalog
  catalogFindMany: vi.fn(),
  catalogUpsert: vi.fn(),
  // cnpj-monitor
  invoiceFindMany: vi.fn(),
  cnpjMonitoringFindMany: vi.fn(),
  cnpjMonitoringFindUnique: vi.fn(),
  cnpjMonitoringCreate: vi.fn(),
  cnpjMonitoringUpdate: vi.fn(),
  cnpjCacheFindMany: vi.fn(),
  lookupCnpj: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  default: {
    invoiceTaxTotals: {
      upsert: mocks.taxTotalsUpsert,
      findUnique: mocks.taxTotalsFindUnique,
    },
    invoiceItemTax: {
      deleteMany: mocks.itemTaxDeleteMany,
      createMany: mocks.itemTaxCreateMany,
      findMany: mocks.itemTaxFindMany,
    },
    contactFiscal: {
      findUnique: mocks.contactFiscalFindUnique,
      create: mocks.contactFiscalCreate,
      update: mocks.contactFiscalUpdate,
    },
    invoiceDuplicata: {
      deleteMany: mocks.duplicataDeleteMany,
      createMany: mocks.duplicataCreateMany,
    },
    productRegistry: {
      findUnique: mocks.productRegistryFindUnique,
      findMany: mocks.productRegistryFindMany,
      create: mocks.productRegistryCreate,
      update: mocks.productRegistryUpdate,
    },
    ncmCache: {
      findUnique: mocks.ncmCacheFindUnique,
      upsert: mocks.ncmCacheUpsert,
      findMany: mocks.ncmCacheFindMany,
    },
    stockEntry: {
      findUnique: mocks.stockEntryFindUnique,
      create: mocks.stockEntryCreate,
      update: mocks.stockEntryUpdate,
    },
    productSettingsCatalog: {
      findMany: mocks.catalogFindMany,
      upsert: mocks.catalogUpsert,
    },
    invoice: {
      findMany: mocks.invoiceFindMany,
    },
    cnpjMonitoring: {
      findMany: mocks.cnpjMonitoringFindMany,
      findUnique: mocks.cnpjMonitoringFindUnique,
      create: mocks.cnpjMonitoringCreate,
      update: mocks.cnpjMonitoringUpdate,
    },
    cnpjCache: {
      findMany: mocks.cnpjCacheFindMany,
    },
    $transaction: mocks.$transaction,
  },
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn() }),
}));

vi.mock('@/lib/cnpj-lookup', () => ({
  lookupCnpj: (...args: unknown[]) => mocks.lookupCnpj(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
    const tx = {
      invoiceItemTax: {
        deleteMany: mocks.itemTaxDeleteMany,
        createMany: mocks.itemTaxCreateMany,
      },
      invoiceDuplicata: {
        deleteMany: mocks.duplicataDeleteMany,
        createMany: mocks.duplicataCreateMany,
      },
    };
    return fn(tx);
  });
});

describe('invoice-tax-store Prisma CRUD', () => {
  it('upserts tax totals via invoiceTaxTotals.upsert', async () => {
    mocks.taxTotalsUpsert.mockResolvedValue({});
    const { upsertTaxTotals } = await import('../invoice-tax-store');
    await upsertTaxTotals({
      invoiceId: 'inv-1',
      companyId: 'co-1',
      vbc: 100,
      vicms: 18,
      vpis: null,
      vcofins: null,
      vipi: null,
      vfrete: null,
      vseg: null,
      vdesc: null,
      voutro: null,
      vtottrib: null,
      vfcp: null,
      vicmsSt: null,
      itemCount: 1,
    });
    expect(mocks.taxTotalsUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { invoiceId: 'inv-1' },
        create: expect.objectContaining({ invoiceId: 'inv-1', companyId: 'co-1', vbc: 100 }),
      }),
    );
  });

  it('reads tax totals and replaces item taxes in a transaction', async () => {
    mocks.taxTotalsFindUnique.mockResolvedValue({
      invoiceId: 'inv-1',
      companyId: 'co-1',
      vbc: 10,
      vicms: 1,
      vpis: null,
      vcofins: null,
      vipi: null,
      vfrete: null,
      vseg: null,
      vdesc: null,
      voutro: null,
      vtottrib: null,
      vfcp: null,
      vicmsSt: null,
      computedAt: new Date('2026-01-01'),
    });
    mocks.itemTaxDeleteMany.mockResolvedValue({ count: 0 });
    mocks.itemTaxCreateMany.mockResolvedValue({ count: 1 });

    const { upsertItemTaxes } = await import('../invoice-tax-store');
    await upsertItemTaxes('inv-1', 'co-1', [
      {
        itemNumber: 1,
        productCode: 'P1',
        productDescription: 'Item',
        ncm: null,
        cfop: null,
        cest: null,
        origem: null,
        quantity: 1,
        unitPrice: 10,
        totalValue: 10,
        cstIcms: null,
        baseIcms: null,
        aliqIcms: null,
        valorIcms: null,
        cstPis: null,
        aliqPis: null,
        valorPis: null,
        cstCofins: null,
        aliqCofins: null,
        valorCofins: null,
        aliqIpi: null,
        valorIpi: null,
        valorFcp: null,
      },
    ]);
    expect(mocks.itemTaxDeleteMany).toHaveBeenCalledWith({ where: { invoiceId: 'inv-1' } });
    expect(mocks.itemTaxCreateMany).toHaveBeenCalledOnce();
  });
});

describe('contact-fiscal-store Prisma CRUD', () => {
  it('creates when missing and coalesces fields on update', async () => {
    mocks.contactFiscalFindUnique.mockResolvedValueOnce(null);
    mocks.contactFiscalCreate.mockResolvedValue({});
    const { upsertContactFiscal, getContactFiscal } = await import('../contact-fiscal-store');

    await upsertContactFiscal({
      companyId: 'co-1',
      cnpj: '11222333000181',
      ie: '123',
      im: null,
      crt: '1',
      uf: 'SP',
      city: 'São Paulo - SP',
      sourceInvoiceId: 'inv-1',
    });
    expect(mocks.contactFiscalCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          companyId: 'co-1',
          cnpj: '11222333000181',
          ie: '123',
        }),
      }),
    );

    mocks.contactFiscalFindUnique.mockResolvedValueOnce({
      id: 'cf-1',
      companyId: 'co-1',
      cnpj: '11222333000181',
      ie: '123',
      im: null,
      crt: '1',
      uf: 'SP',
      city: 'São Paulo - SP',
      sourceInvoiceId: 'inv-1',
      extractedAt: new Date(),
    });
    mocks.contactFiscalUpdate.mockResolvedValue({});
    await upsertContactFiscal({
      companyId: 'co-1',
      cnpj: '11222333000181',
      ie: null,
      im: 'IM-9',
      crt: null,
      uf: null,
      sourceInvoiceId: 'inv-2',
    });
    expect(mocks.contactFiscalUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'cf-1' },
        data: expect.objectContaining({ ie: '123', im: 'IM-9', sourceInvoiceId: 'inv-2' }),
      }),
    );

    mocks.contactFiscalFindUnique.mockResolvedValueOnce({
      id: 'cf-1',
      companyId: 'co-1',
      cnpj: '11222333000181',
      ie: '123',
      im: 'IM-9',
      crt: '1',
      uf: 'SP',
      city: 'São Paulo - SP',
      sourceInvoiceId: 'inv-2',
      extractedAt: new Date('2026-01-02'),
    });
    await expect(getContactFiscal('co-1', '11222333000181')).resolves.toMatchObject({
      cnpj: '11222333000181',
      ie: '123',
    });
  });

  it('skips upsert when cnpj is empty', async () => {
    const { upsertContactFiscal } = await import('../contact-fiscal-store');
    await upsertContactFiscal({
      companyId: 'co-1',
      cnpj: '',
      ie: null,
      im: null,
      crt: null,
      uf: null,
      sourceInvoiceId: null,
    });
    expect(mocks.contactFiscalFindUnique).not.toHaveBeenCalled();
  });
});

describe('invoice-duplicata-store', () => {
  it('extracts duplicatas from cobr XML and replaces rows via Prisma transaction', async () => {
    const { extractDuplicatasFast, upsertDuplicatas } = await import('../invoice-duplicata-store');
    const xml = `
      <cobr>
        <fat><nFat>F1</nFat><vOrig>100.00</vOrig><vLiq>90.00</vLiq></fat>
        <dup><nDup>001</nDup><dVenc>2026-03-01</dVenc><vDup>90.00</vDup></dup>
      </cobr>`;
    const parsed = extractDuplicatasFast(xml);
    expect(parsed.hasDupTag).toBe(true);
    expect(parsed.duplicatas).toEqual([
      expect.objectContaining({
        dupNumero: '001',
        dupVencimento: '2026-03-01',
        dupValor: 90,
        faturaNumero: 'F1',
      }),
    ]);

    mocks.duplicataDeleteMany.mockResolvedValue({ count: 0 });
    mocks.duplicataCreateMany.mockResolvedValue({ count: 1 });
    await upsertDuplicatas('inv-1', 'co-1', [
      {
        dupNumero: '001',
        dupVencimento: '2026-03-01',
        dupValor: 90,
        faturaNumero: 'F1',
        faturaValorOriginal: 100,
        faturaValorLiquido: 90,
      },
    ]);
    expect(mocks.duplicataDeleteMany).toHaveBeenCalledWith({ where: { invoiceId: 'inv-1' } });
    expect(mocks.duplicataCreateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [expect.objectContaining({ invoiceId: 'inv-1', companyId: 'co-1', dupNumero: '001' })],
      }),
    );
    const persisted = mocks.duplicataCreateMany.mock.calls[0][0].data[0];
    expect(persisted.dupValor).toBe(90);
    expect(persisted.dupValorDecimal.toFixed(2)).toBe('90.00');
    expect(persisted.faturaValorOriginalDecimal.toFixed(2)).toBe('100.00');
    expect(persisted.faturaValorLiquidoDecimal.toFixed(2)).toBe('90.00');
  });
});

describe('product-registry-store Prisma CRUD', () => {
  it('creates with next codigo and updates existing by productKey', async () => {
    const { upsertProductRegistry, getProductRegistryByKeys } = await import(
      '../product-registry-store'
    );
    const baseInput = {
      companyId: 'co-1',
      productKey: 'pk-1',
      code: 'C1',
      description: 'Produto',
      ncm: '12345678',
      unit: 'UN',
      ean: null,
      anvisaCode: null,
      anvisaSource: null,
      anvisaConfidence: null,
      anvisaMatchedProductName: null,
      anvisaHolder: null,
      anvisaProcess: null,
      anvisaStatus: null,
      anvisaSyncedAt: null,
    };

    mocks.productRegistryFindUnique.mockResolvedValueOnce(null);
    mocks.productRegistryFindMany.mockResolvedValueOnce([{ codigo: '00007' }]);
    mocks.productRegistryCreate.mockResolvedValue({});
    await upsertProductRegistry(baseInput);
    expect(mocks.productRegistryCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          productKey: 'pk-1',
          codigo: '000008',
          outOfLine: true,
        }),
      }),
    );

    mocks.productRegistryFindUnique.mockResolvedValueOnce({ id: 'pr-1' });
    mocks.productRegistryUpdate.mockResolvedValue({});
    await upsertProductRegistry({ ...baseInput, description: 'Atualizado' });
    expect(mocks.productRegistryUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'pr-1' },
        data: expect.objectContaining({ description: 'Atualizado' }),
      }),
    );

    mocks.productRegistryFindMany.mockResolvedValueOnce([
      {
        id: 'pr-1',
        companyId: 'co-1',
        productKey: 'pk-1',
        codigo: '000008',
        code: 'C1',
        description: 'Atualizado',
        ncm: '12345678',
        unit: 'UN',
        ean: null,
        anvisaCode: null,
        anvisaSource: null,
        anvisaConfidence: null,
        anvisaMatchedProductName: null,
        anvisaHolder: null,
        anvisaProcess: null,
        anvisaStatus: null,
        anvisaExpiration: null,
        anvisaRiskClass: null,
        anvisaManufacturer: null,
        anvisaManufacturerCountry: null,
        manufacturerShortName: null,
        anvisaSyncedAt: null,
        shortName: null,
        productType: null,
        productSubtype: null,
        productSubgroup: null,
        outOfLine: true,
        instrumental: false,
        fiscalSitTributaria: null,
        fiscalNomeTributacao: null,
        fiscalIcms: null,
        fiscalPis: null,
        fiscalCofins: null,
        fiscalObs: null,
        fiscalCest: null,
        fiscalOrigem: null,
        fiscalCfopEntrada: null,
        fiscalCfopSaida: null,
        fiscalIpi: null,
        fiscalFcp: null,
        fiscalCstIpi: null,
        fiscalCstPis: null,
        fiscalCstCofins: null,
        fiscalObsIcms: null,
        fiscalObsPisCofins: null,
        productRefs: [],
        defaultSupplier: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    await expect(getProductRegistryByKeys('co-1', ['pk-1'])).resolves.toEqual([
      expect.objectContaining({ productKey: 'pk-1', description: 'Atualizado' }),
    ]);
  });
});

describe('ncm-lookup Prisma cache', () => {
  it('formats codes and returns a hierarchy-complete DB row without API', async () => {
    const { formatNcmCode, lookupNcm } = await import('../ncm-lookup');
    expect(formatNcmCode('12345678')).toBe('1234.56.78');

    const globalCache = globalThis as unknown as { ncmMemoryCache?: unknown };
    delete globalCache.ncmMemoryCache;

    mocks.ncmCacheFindUnique.mockResolvedValue({
      code: '12345678',
      descricao: 'Folha',
      hierarchy: [
        { codigo: '1234', descricao: 'Cap' },
        { codigo: '123456', descricao: 'Sub' },
        { codigo: '12345678', descricao: 'Folha' },
      ],
      fullDescription: 'Cap > Sub > Folha',
    });

    await expect(lookupNcm('12345678')).resolves.toMatchObject({
      codigo: '1234.56.78',
      descricao: 'Folha',
      fullDescription: 'Cap > Sub > Folha',
    });
    expect(mocks.ncmCacheUpsert).not.toHaveBeenCalled();
  });
});

describe('stock-entry-store Prisma CRUD', () => {
  it('creates and updates stock entries through Prisma', async () => {
    const { upsertStockEntry } = await import('../stock-entry-store');
    const base = {
      id: 'se-1',
      companyId: 'co-1',
      invoiceId: 'inv-1',
      invoiceNumber: '100',
      supplierName: 'Fornecedor',
      supplierCnpj: '11222333000181',
      issueDate: new Date('2026-01-10'),
      totalValue: 50,
      totalItems: 2,
      matchedItems: 1,
      status: 'pending',
      registeredAt: null,
      registeredBy: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    mocks.stockEntryFindUnique.mockResolvedValueOnce(null);
    mocks.stockEntryCreate.mockResolvedValue(base);
    await expect(
      upsertStockEntry({
        companyId: 'co-1',
        invoiceId: 'inv-1',
        invoiceNumber: '100',
        totalItems: 2,
        matchedItems: 1,
      }),
    ).resolves.toMatchObject({ invoiceId: 'inv-1', status: 'pending' });
    expect(mocks.stockEntryCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ companyId: 'co-1', invoiceId: 'inv-1' }),
      }),
    );

    mocks.stockEntryFindUnique.mockResolvedValueOnce(base);
    mocks.stockEntryUpdate.mockResolvedValue({
      ...base,
      matchedItems: 2,
      status: 'registered',
      registeredAt: new Date(),
    });
    await expect(
      upsertStockEntry({
        companyId: 'co-1',
        invoiceId: 'inv-1',
        matchedItems: 2,
        status: 'registered',
      }),
    ).resolves.toMatchObject({ status: 'registered', matchedItems: 2 });
  });
});

describe('product-settings-catalog Prisma CRUD', () => {
  it('lists catalog entries via productSettingsCatalog.findMany', async () => {
    const now = new Date('2026-01-01');
    mocks.catalogFindMany.mockResolvedValue([
      {
        id: 'cat-1',
        companyId: 'co-1',
        section: 'line',
        value: 'Linha A',
        parentValue: null,
        parentSecondaryValue: null,
        extraValue: null,
        createdAt: now,
        updatedAt: now,
      },
    ]);
    const { listProductSettingsCatalogEntries } = await import('../product-settings-catalog');
    await expect(listProductSettingsCatalogEntries('co-1')).resolves.toEqual([
      expect.objectContaining({
        id: 'cat-1',
        companyId: 'co-1',
        section: 'line',
        value: 'Linha A',
      }),
    ]);
    expect(mocks.catalogFindMany).toHaveBeenCalledWith({
      where: { companyId: 'co-1' },
      orderBy: [{ section: 'asc' }, { value: 'asc' }],
    });
  });

  it('upserts catalog entry via productSettingsCatalog.upsert and skips empty value', async () => {
    mocks.catalogUpsert.mockResolvedValue({});
    const { upsertProductSettingsCatalogEntry } = await import('../product-settings-catalog');

    await upsertProductSettingsCatalogEntry({
      companyId: 'co-1',
      section: 'group',
      value: '  Grupo X  ',
      parentValue: 'Linha A',
      parentSecondaryValue: null,
      extraValue: '  extra  ',
    });
    expect(mocks.catalogUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          companyId_section_value_parentValueKey_parentSecondaryValueKey: {
            companyId: 'co-1',
            section: 'group',
            value: 'Grupo X',
            parentValueKey: 'Linha A',
            parentSecondaryValueKey: '',
          },
        },
        create: expect.objectContaining({
          companyId: 'co-1',
          section: 'group',
          value: 'Grupo X',
          parentValue: 'Linha A',
          parentSecondaryValue: null,
          parentValueKey: 'Linha A',
          parentSecondaryValueKey: '',
          extraValue: 'extra',
        }),
        update: expect.objectContaining({ extraValue: 'extra' }),
      }),
    );

    mocks.catalogUpsert.mockClear();
    await upsertProductSettingsCatalogEntry({
      companyId: 'co-1',
      section: 'line',
      value: '   ',
    });
    expect(mocks.catalogUpsert).not.toHaveBeenCalled();
  });
});

describe('cnpj-monitor Prisma CRUD', () => {
  it('lists recent changes via cnpjMonitoring.findMany', async () => {
    const changedAt = new Date('2026-01-15');
    mocks.cnpjMonitoringFindMany.mockResolvedValue([
      {
        cnpj: '11222333000181',
        contactName: 'Fornecedor',
        previousStatus: 'ATIVA',
        currentStatus: 'SUSPENSA',
        changedAt,
      },
    ]);
    const { getRecentCnpjChanges } = await import('../cnpj-monitor');
    await expect(getRecentCnpjChanges('co-1', 10)).resolves.toEqual([
      {
        cnpj: '11222333000181',
        name: 'Fornecedor',
        previousStatus: 'ATIVA',
        currentStatus: 'SUSPENSA',
        changedAt,
      },
    ]);
    expect(mocks.cnpjMonitoringFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          companyId: 'co-1',
          changedAt: expect.objectContaining({ not: null }),
        }),
        orderBy: { changedAt: 'desc' },
        take: 10,
      }),
    );
  });

  it('creates monitoring row on first batch check and updates when status changes', async () => {
    mocks.invoiceFindMany
      .mockResolvedValueOnce([{ senderCnpj: '11.222.333/0001-81', senderName: 'ACME' }])
      .mockResolvedValueOnce([]);
    mocks.cnpjMonitoringFindMany.mockResolvedValue([]);
    mocks.cnpjCacheFindMany.mockResolvedValue([{ cnpj: '11222333000181' }]);
    mocks.lookupCnpj.mockResolvedValue({ situacaoCadastral: 'ATIVA' });
    mocks.cnpjMonitoringFindUnique.mockResolvedValue(null);
    mocks.cnpjMonitoringCreate.mockResolvedValue({});

    const { runBatchCnpjCheck } = await import('../cnpj-monitor');
    await expect(runBatchCnpjCheck('co-1', 10, 0)).resolves.toEqual({
      checked: 1,
      changed: 0,
      errors: 0,
    });
    expect(mocks.cnpjMonitoringCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          companyId: 'co-1',
          cnpj: '11222333000181',
          contactName: 'ACME',
          currentStatus: 'ATIVA',
        }),
      }),
    );

    mocks.invoiceFindMany
      .mockResolvedValueOnce([{ senderCnpj: '11222333000181', senderName: 'ACME' }])
      .mockResolvedValueOnce([]);
    mocks.cnpjMonitoringFindMany.mockResolvedValue([
      { cnpj: '11222333000181', currentStatus: 'ATIVA' },
    ]);
    mocks.cnpjCacheFindMany.mockResolvedValue([{ cnpj: '11222333000181' }]);
    mocks.lookupCnpj.mockResolvedValue({ situacaoCadastral: 'BAIXADA' });
    mocks.cnpjMonitoringFindUnique.mockResolvedValue({
      id: 'mon-1',
      currentStatus: 'ATIVA',
      contactName: 'ACME',
      changedAt: null,
    });
    mocks.cnpjMonitoringUpdate.mockResolvedValue({});

    await expect(runBatchCnpjCheck('co-1', 10, 0)).resolves.toEqual({
      checked: 1,
      changed: 1,
      errors: 0,
    });
    expect(mocks.cnpjMonitoringUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'mon-1' },
        data: expect.objectContaining({
          previousStatus: 'ATIVA',
          currentStatus: 'BAIXADA',
        }),
      }),
    );
  });
});
