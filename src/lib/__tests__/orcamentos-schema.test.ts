import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { quoteIssuedAtSchema, quoteUpsertSchema } from '../schemas/orcamentos';
import { quoteNumberLockKey, quoteWriteLockKey } from '../postgres-advisory-lock';

const validBody = {
  customerCnpj: '07832309000197',
  customerName: 'Hospital Exemplo',
  items: [{ code: '1', description: 'Peça', quantity: '1', unitPrice: '10.00' }],
};

describe('SPEC-085 — validação de orçamento', () => {
  it('aceita data civil real e recusa 31/02 e mês 13', () => {
    expect(quoteIssuedAtSchema.safeParse('2026-09-15').success).toBe(true);
    expect(quoteIssuedAtSchema.safeParse('2026-02-31').success).toBe(false);
    expect(quoteIssuedAtSchema.safeParse('2026-13-01').success).toBe(false);
    expect(quoteUpsertSchema.safeParse({ ...validBody, issuedAt: '2026-02-31' }).success).toBe(false);
  });

  it('chave de número e de escrita são estáveis e distintas', () => {
    expect(quoteNumberLockKey('co1')).toBe('quote-number:co1');
    expect(quoteWriteLockKey('q1')).toBe('quote-write:q1');
    expect(quoteNumberLockKey('co1')).not.toBe(quoteWriteLockKey('co1'));
  });

  it('PDF só marca emitido depois de renderizar', () => {
    const src = readFileSync(resolve(process.cwd(), 'src/app/api/orcamentos/[id]/pdf/route.ts'), 'utf8');
    expect(src).toMatch(/renderHtmlToPdf[\s\S]*catch[\s\S]*status: 503[\s\S]*markQuoteIssued/);
  });

  it('próximo número toma lock de transação por empresa', () => {
    const src = readFileSync(resolve(process.cwd(), 'src/lib/orcamentos/store.ts'), 'utf8');
    expect(src).toMatch(/acquirePostgresTransactionAdvisoryLock\(tx, quoteNumberLockKey\(companyId\)\)/);
    expect(src).toMatch(/assertProductsOfCompany/);
    expect(src).toMatch(/status: \{ not: 'cancelled' \}/);
  });
});
