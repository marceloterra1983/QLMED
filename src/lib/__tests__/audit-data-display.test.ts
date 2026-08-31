import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { nfeTaxCoverage } from '@/lib/fiscal-period';

const root = resolve(__dirname, '../../..');
const read = (rel: string) => readFileSync(resolve(root, rel), 'utf8');

describe('SPEC-030 list display contracts', () => {
  it('NFS-e recebidas filtra direction=received na lista e nos year chips (FR-001)', () => {
    const src = read('src/app/(painel)/fiscal/nfse-recebidas/page-client.tsx');
    expect(src).toMatch(/type=NFSE&direction=received/);
    expect(src).toMatch(/direction:\s*'received'|params\.set\('direction',\s*'received'\)/);
    expect(src).not.toMatch(/type=NFSE&dateFrom=/);
  });

  it('listas fiscais pedem limit 5000, o teto da API (FR-002)', () => {
    const files = [
      'src/app/(painel)/fiscal/invoices/page-client.tsx',
      'src/app/(painel)/fiscal/issued/page-client.tsx',
      'src/app/(painel)/fiscal/cte/page-client.tsx',
      'src/app/(painel)/fiscal/nfse-recebidas/page-client.tsx',
    ];
    for (const file of files) {
      const src = read(file);
      expect(src, file).not.toMatch(/limit:\s*'2000'/);
      expect(src, file).toMatch(/limit:\s*'5000'/);
    }
  });

  it('contas a pagar não escondem vencidas (FR-003)', () => {
    const src = read('src/lib/financeiro-shared.ts');
    expect(src).not.toMatch(/isFutureVencimento/);
    expect(src).not.toMatch(/filters only future/);
  });

  it('contas a receber abrem com todos os status (FR-004)', () => {
    const src = read('src/app/(painel)/financeiro/components/FinanceiroPageClient.tsx');
    expect(src).not.toMatch(/defaultStatusFilter:\s*'upcoming'/);
  });

  it('backfill de duplicata não está preso a tabela vazia (FR-005)', () => {
    const src = read('src/lib/financeiro-duplicatas.ts');
    expect(src).not.toMatch(/dupCount === 0/);
    expect(src).toMatch(/backfillInvoiceDuplicatas/);
  });
});

describe('nfeTaxCoverage (FR-006)', () => {
  it('conta só NF-e do conjunto e cruzamento com tax totals', () => {
    const invoices = [
      { id: 'a', type: 'NFE' },
      { id: 'b', type: 'NFE' },
      { id: 'c', type: 'CTE' },
      { id: 'd', type: 'NFSE' },
    ];
    expect(nfeTaxCoverage(invoices, ['a', 'c'])).toEqual({ totalNfe: 2, withTaxData: 1 });
  });

  it('período vazio é cobertura zero, não all-time', () => {
    expect(nfeTaxCoverage([], ['a', 'b'])).toEqual({ totalNfe: 0, withTaxData: 0 });
  });
});
