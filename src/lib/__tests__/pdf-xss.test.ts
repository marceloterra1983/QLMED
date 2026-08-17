import { describe, expect, it } from 'vitest';
import { buildFallbackHtml } from '@/lib/pdf/danfe-generator';
import {
  buildCteDataFromInvoice,
  buildCteHtml,
  extractCteData,
} from '@/lib/pdf/dacte-generator';
import type { PdfInvoiceView } from '@/lib/pdf/pdf-types';

const validKey = '9'.repeat(44);

const invoice: PdfInvoiceView = {
  type: 'CTE',
  number: '12',
  series: '1',
  issueDate: new Date('2026-01-01T00:00:00.000Z'),
  senderCnpj: '12345678000190',
  senderName: 'Emitente',
  recipientCnpj: '98765432000190',
  recipientName: 'Destinatario',
  totalValue: 10,
  status: 'AUTHORIZED',
  accessKey: validKey,
  direction: 'OUT',
  company: { razaoSocial: 'Empresa', cnpj: '12345678000190' },
};

describe('PDF HTML output', () => {
  it('ignores an invalid protocol access key', () => {
    const data = extractCteData({
      cteProc: {
        CTe: { infCte: { ide: {}, $: { Id: 'CTe' + validKey } } },
        protCTe: { infProt: { chCTe: '<script>alert(1)</script>' } },
      },
    }, invoice);

    expect(data.chCTe).toBe(validKey);
  });

  it('escapes document titles derived from invoice data', () => {
    const malicious = { ...invoice, accessKey: '<script>alert(1)</script>' };
    const cteHtml = buildCteHtml(buildCteDataFromInvoice(malicious), false);
    const fallbackHtml = buildFallbackHtml({ ...malicious, type: 'NFE', number: '<img src=x>' }, false);

    expect(cteHtml).not.toContain('<title>QLMED/<script>');
    expect(fallbackHtml).not.toContain('<title>NF-e <img');
    expect(cteHtml).toContain('&lt;script&gt;');
    expect(fallbackHtml).toContain('&lt;img src=x&gt;');
  });
});
