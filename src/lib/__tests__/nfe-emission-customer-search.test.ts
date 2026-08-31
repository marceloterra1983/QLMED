import { describe, expect, it } from 'vitest';
import {
  buildIssuedCustomerWhere,
  customerMatchesSearch,
  filterIssuedCustomersForCompany,
  formatDestinatarioAddressLine,
  isCnpjLikeSearch,
  mergeDestinatarioAddressSources,
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
