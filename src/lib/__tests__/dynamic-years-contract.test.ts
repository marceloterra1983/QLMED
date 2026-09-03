import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const FISCAL_PAGES = [
  'src/app/(painel)/fiscal/invoices/page-client.tsx',
  'src/app/(painel)/fiscal/issued/page-client.tsx',
  'src/app/(painel)/fiscal/cte/page-client.tsx',
  'src/app/(painel)/fiscal/nfse-recebidas/page-client.tsx',
  'src/app/(painel)/estoque/entrada-nfe/page-client.tsx',
];

describe('G3 — Dynamic fiscal years contract in panel pages', () => {
  it('does NOT use the hardcoded 4-year probe [cy - 1, cy - 2, cy - 3, cy - 4] in any fiscal page', () => {
    for (const relPath of FISCAL_PAGES) {
      const fullPath = path.join(process.cwd(), relPath);
      const content = readFileSync(fullPath, 'utf8');

      expect(content).not.toMatch(/\[cy\s*-\s*1,\s*cy\s*-\s*2,\s*cy\s*-\s*3,\s*cy\s*-\s*4\]/);
    }
  });

  it('calls /api/invoices/years in all 5 fiscal pages', () => {
    for (const relPath of FISCAL_PAGES) {
      const fullPath = path.join(process.cwd(), relPath);
      const content = readFileSync(fullPath, 'utf8');

      expect(content).toContain('/api/invoices/years');
    }
  });
});
