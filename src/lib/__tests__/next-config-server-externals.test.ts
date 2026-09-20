import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../../..');

describe('next.config serverExternalPackages', () => {
  it('mantém pacotes nativos/pesados fora do bundle RSC', () => {
    const config = readFileSync(resolve(root, 'next.config.mjs'), 'utf8');
    for (const pkg of ['bcryptjs', 'node-forge', 'xml2js', 'exceljs', 'jszip', 'puppeteer-core']) {
      expect(config, pkg).toContain(`'${pkg}'`);
    }
  });
});

describe('SPEC-083: modais lazy só montam abertos', () => {
  it('não hidrata Invoice/NfeDetails fechados', () => {
    const produtos = readFileSync(
      resolve(root, 'src/app/(painel)/cadastro/produtos/page-client.tsx'),
      'utf8',
    );
    const contact = readFileSync(resolve(root, 'src/components/ContactDetailsModal.tsx'), 'utf8');
    const stock = readFileSync(
      resolve(root, 'src/app/(painel)/estoque/controle/components/ProductStockDetailModal.tsx'),
      'utf8',
    );
    expect(produtos).toContain('{invoiceModalId && (');
    expect(contact).toContain('{isInvoiceModalOpen && (');
    expect(contact).toContain('{isNfeDetailsOpen && (');
    expect(stock).toContain('{nfeInvoiceId && (');
  });
});
