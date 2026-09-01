import { describe, expect, it } from 'vitest';
import {
  buildIssuedCustomerWhere,
  buildTopBilledWhere,
  customerMatchesSearch,
  DESTINATARIO_BILLING_WINDOW_MONTHS,
  DESTINATARIO_TOP_BILLED_LIMIT,
  destinatarioBillingWindowStart,
  filterIssuedCustomersForCompany,
  formatDestinatarioAddressLine,
  isCnpjLikeSearch,
  mergeDestinatarioAddressSources,
  orderDestinatariosForDropdown,
  rankRecipientsByBilling,
} from '@/lib/nfe-emission/customer-search';

const HOSPITAL = {
  companyId: 'co-a',
  name: 'Hospital Vida Santa Casa',
  cnpj: '12345678000199',
  tradeName: 'Vida Saúde',
};

const OTHER_TENANT = {
  companyId: 'co-b',
  name: 'Hospital Vida Santa Casa',
  cnpj: '98765432000188',
  tradeName: 'Vida Saúde',
};

describe('busca de destinatário (nome + CNPJ)', () => {
  it('trata CNPJ com máscara e só dígitos como o mesmo tipo de busca', () => {
    expect(isCnpjLikeSearch('12.345.678/0001-99')).toBe(true);
    expect(isCnpjLikeSearch('12345678000199')).toBe(true);
    expect(isCnpjLikeSearch('12.345')).toBe(true);
    expect(isCnpjLikeSearch('Hospital Vida')).toBe(false);
    expect(isCnpjLikeSearch('Vida 12')).toBe(false);
  });

  it('filtra por trecho da razão e do nome fantasia', () => {
    expect(customerMatchesSearch(HOSPITAL, 'santa casa')).toBe(true);
    expect(customerMatchesSearch(HOSPITAL, 'Vida Saúde')).toBe(true);
    expect(customerMatchesSearch(HOSPITAL, 'saúde')).toBe(true);
    expect(customerMatchesSearch(HOSPITAL, 'Outra Clinica')).toBe(false);
  });

  it('filtra também por shortName/apelido do cadastro', () => {
    const withNick = { ...HOSPITAL, shortName: 'Vida' };
    expect(customerMatchesSearch(withNick, 'vida')).toBe(true);
    expect(customerMatchesSearch({ ...HOSPITAL, tradeName: null, shortName: 'Apelido Clinica' }, 'apelido')).toBe(true);
    expect(customerMatchesSearch({ ...HOSPITAL, tradeName: null, shortName: null }, 'apelido')).toBe(false);
  });

  it('filtra CNPJ com pontuação e só dígitos para o mesmo cadastro', () => {
    expect(customerMatchesSearch(HOSPITAL, '12.345.678/0001-99')).toBe(true);
    expect(customerMatchesSearch(HOSPITAL, '12345678000199')).toBe(true);
    expect(customerMatchesSearch(HOSPITAL, '12345')).toBe(true);
    expect(customerMatchesSearch(HOSPITAL, '98.765.432/0001-88')).toBe(false);
  });

  it('não devolve destinatário de outro tenant', () => {
    const visible = filterIssuedCustomersForCompany(
      [HOSPITAL, OTHER_TENANT],
      'co-a',
      'Vida',
    );
    expect(visible).toEqual([HOSPITAL]);
    expect(visible.some((row) => row.companyId === 'co-b')).toBe(false);
    expect(visible.some((row) => row.cnpj === OTHER_TENANT.cnpj)).toBe(false);
  });

  it('WHERE Prisma amarra companyId e não lê tenant do texto', () => {
    const where = buildIssuedCustomerWhere('co-a', 'Hospital empresa-b');
    expect(where.companyId).toBe('co-a');
    expect(where.type).toBe('NFE');
    expect(where.direction).toBe('issued');
    expect(JSON.stringify(where)).not.toMatch(/"companyId":"empresa-b"/);
    expect(where.OR).toEqual(
      expect.arrayContaining([
        { recipientName: { contains: 'Hospital empresa-b', mode: 'insensitive' } },
      ]),
    );
  });

  it('WHERE de CNPJ usa dígitos (máscara ou não) e não ILIKE no nome', () => {
    const masked = buildIssuedCustomerWhere('co-a', '12.345.678/0001-99');
    const digits = buildIssuedCustomerWhere('co-a', '12345678000199');
    expect(masked.OR).toEqual([{ recipientCnpj: { startsWith: '12345678000199' } }]);
    expect(digits.OR).toEqual([{ recipientCnpj: { startsWith: '12345678000199' } }]);
    expect(JSON.stringify(masked)).not.toMatch(/recipientName/);
  });

  it('WHERE vazio lista emitidas da empresa sem OR de busca', () => {
    const where = buildIssuedCustomerWhere('co-a', '   ');
    expect(where.OR).toBeUndefined();
    expect(where.companyId).toBe('co-a');
    expect(where.recipientCnpj).toEqual({ not: null });
  });

  it('inclui CNPJs do apelido (fantasia) só na busca por nome', () => {
    const where = buildIssuedCustomerWhere('co-a', 'Vida', ['12345678000199']);
    expect(where.OR).toEqual(
      expect.arrayContaining([
        { recipientCnpj: { in: ['12345678000199'] } },
      ]),
    );
    const cnpjWhere = buildIssuedCustomerWhere('co-a', '12345678000199', ['00000000000000']);
    expect(JSON.stringify(cnpjWhere)).not.toMatch(/00000000000000/);
  });
});

describe('top faturados (caixa aberta sem busca)', () => {
  const invoices = [
    { recipientCnpj: '11111111000111', recipientName: 'Zebra SA', totalValue: 100, companyId: 'co-a' },
    { recipientCnpj: '22222222000122', recipientName: 'Alpha SA', totalValue: 500, companyId: 'co-a' },
    { recipientCnpj: '11111111000111', recipientName: 'Zebra SA', totalValue: 50, companyId: 'co-a' },
    { recipientCnpj: '33333333000133', recipientName: 'Beta SA', totalValue: 200, companyId: 'co-a' },
    { recipientCnpj: '99999999000199', recipientName: 'Outro Tenant', totalValue: 9999, companyId: 'co-b' },
    { recipientCnpj: '12.345.678/0001-99', recipientName: 'Mascara SA', totalValue: 300, companyId: 'co-a' },
  ];

  it('ordena por Σ totalValue desc e limita a 10', () => {
    const ranked = rankRecipientsByBilling(invoices, DESTINATARIO_TOP_BILLED_LIMIT, 'co-a');
    expect(ranked.map((r) => r.cnpj)).toEqual([
      '22222222000122',
      '12345678000199',
      '33333333000133',
      '11111111000111',
    ]);
    expect(ranked[0].billedTotal).toBe(500);
    expect(ranked.find((r) => r.cnpj === '11111111000111')?.billedTotal).toBe(150);
    expect(ranked.every((r) => r.cnpj.length === 14)).toBe(true);
    expect(ranked.length).toBeLessThanOrEqual(DESTINATARIO_TOP_BILLED_LIMIT);
  });

  it('sem busca devolve só o top — não dumpa o catálogo A–Z', () => {
    const top = rankRecipientsByBilling(invoices, 2, 'co-a');
    const catalog = [
      { cnpj: '11111111000111', name: 'Zebra SA' },
      { cnpj: '22222222000122', name: 'Alpha SA' },
      { cnpj: '33333333000133', name: 'Beta SA' },
      { cnpj: '44444444000144', name: 'Gamma SA' },
      { cnpj: '55555555000155', name: 'Delta SA' },
    ];
    const ordered = orderDestinatariosForDropdown(catalog, top, false);
    expect(ordered).toHaveLength(2);
    expect(ordered.every((r) => r.topBilled)).toBe(true);
    expect(ordered.map((r) => r.cnpj)).toEqual(top.map((r) => r.cnpj));
    expect(ordered.some((r) => r.cnpj === '44444444000144')).toBe(false);
    expect(ordered.some((r) => r.cnpj === '55555555000155')).toBe(false);
  });

  it('não duplica CNPJ no top', () => {
    const top = [
      { cnpj: '22222222000122', name: 'Alpha SA' },
      { cnpj: '22222222000122', name: 'Alpha SA dup' },
    ];
    const ordered = orderDestinatariosForDropdown(
      [{ cnpj: '22222222000122', name: 'Alpha SA' }],
      top,
      false,
    );
    expect(ordered).toHaveLength(1);
  });
});

describe('busca ativa (resto via busca manual)', () => {
  it('com busca ativa lista filtrada A–Z sem topBilled', () => {
    const matches = [
      { cnpj: '33333333000133', name: 'Beta SA' },
      { cnpj: '22222222000122', name: 'Alpha SA' },
    ];
    const ordered = orderDestinatariosForDropdown(
      matches,
      [{ cnpj: '99999999000199', name: 'Ignorado' }],
      true,
    );
    expect(ordered.map((r) => r.name)).toEqual(['Alpha SA', 'Beta SA']);
    expect(ordered.every((r) => r.topBilled === false)).toBe(true);
    expect(ordered.some((r) => r.cnpj === '99999999000199')).toBe(false);
  });

  it('com busca ativa ordena pelo label visível (apelido se houver)', () => {
    const matches = [
      { cnpj: '11111111000111', name: 'Zebra Hospitalar SA', shortName: 'Alpha Clinica' },
      { cnpj: '22222222000122', name: 'Beta SA' },
    ];
    const ordered = orderDestinatariosForDropdown(matches, [], true);
    expect(ordered.map((r) => r.cnpj)).toEqual(['11111111000111', '22222222000122']);
  });
});

describe('tenant e janela companyId', () => {
  it('WHERE do ranking amarra companyId, issued, canceladas fora e janela', () => {
    const since = new Date('2026-03-01T00:00:00.000Z');
    const where = buildTopBilledWhere('co-a', since);
    expect(where.companyId).toBe('co-a');
    expect(where.type).toBe('NFE');
    expect(where.direction).toBe('issued');
    expect(where.cancelledAt).toBeNull();
    expect(where.issueDate).toEqual({ gte: since });
    expect(JSON.stringify(where)).not.toMatch(/co-b/);
  });

  it('janela padrão é 6 meses', () => {
    expect(DESTINATARIO_BILLING_WINDOW_MONTHS).toBe(6);
    const now = new Date('2026-08-15T12:00:00.000Z');
    const start = destinatarioBillingWindowStart(now);
    const months =
      (now.getFullYear() - start.getFullYear()) * 12
      + (now.getMonth() - start.getMonth());
    expect(months).toBe(6);
  });

  it('ranking com companyId ignora linhas de outro tenant', () => {
    const ranked = rankRecipientsByBilling(
      [
        { recipientCnpj: '11111111000111', recipientName: 'A', totalValue: 10, companyId: 'co-a' },
        { recipientCnpj: '22222222000122', recipientName: 'B', totalValue: 999, companyId: 'co-b' },
      ],
      10,
      'co-a',
    );
    expect(ranked.map((r) => r.cnpj)).toEqual(['11111111000111']);
  });
});

describe('endereço sucinto do destinatário', () => {
  it('monta Cidade/UF, bairro ou logradouro curto — sem CEP, complemento ou IE', () => {
    expect(formatDestinatarioAddressLine({ city: 'Campo Grande', uf: 'MS' })).toBe('Campo Grande/MS');
    expect(formatDestinatarioAddressLine({
      district: 'Centro',
      city: 'Campo Grande',
      uf: 'ms',
      zip: '79002-000',
      complement: 'Sala 12',
      ie: '123456',
    })).toBe('Centro — Campo Grande/MS');
    expect(formatDestinatarioAddressLine({
      street: 'Rua das Acácias',
      city: 'Campo Grande',
      uf: 'MS',
    })).toBe('Rua das Acácias — Campo Grande/MS');
    const line = formatDestinatarioAddressLine({
      district: 'Jardim dos Estados',
      city: 'Campo Grande - MS',
      uf: 'MS',
      zip: '79020-000',
      complement: 'Bloco B',
      ie: 'ISENTO',
    });
    expect(line).toBe('Jardim dos Estados — Campo Grande/MS');
    expect(line).not.toMatch(/79020|Bloco|ISENTO|CEP|IE/i);
  });

  it('não inventa linha sem município nem UF', () => {
    expect(formatDestinatarioAddressLine({})).toBe('');
    expect(formatDestinatarioAddressLine({ street: 'Rua A', district: 'Centro' })).toBe('');
    expect(formatDestinatarioAddressLine({ zip: '79000000', ie: '1', complement: 'fundos' })).toBe('');
  });

  it('preferência do cadastro (override) sobre o fiscal', () => {
    const parts = mergeDestinatarioAddressSources(
      { street: 'Rua Nova', district: 'Amambaí', city: 'Campo Grande', state: 'MS' },
      { city: 'Outra Cidade - SP', uf: 'SP' },
    );
    expect(formatDestinatarioAddressLine(parts)).toBe('Amambaí — Campo Grande/MS');
  });
});
