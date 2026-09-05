import { describe, expect, it } from 'vitest';
import {
  abreviarNome,
  buildDailyIssuedSummaryMessages,
  formatCampoGrandeDateISO,
  hourInCampoGrande,
  noAutoLink,
} from '@/lib/daily-issued-summary-message';

const GROUP = '120363411914746947@g.us';

describe('daily-issued-summary-message', () => {
  it('noAutoLink inserts ZWJ between digits', () => {
    const out = noAutoLink('65159');
    expect(out).toContain('\u034f');
    expect(out.replace(/\u034f/g, '')).toBe('65159');
  });

  it('abreviarNome prefers distinctive name', () => {
    expect(abreviarNome('HOSPITAL SANTA CASA DE CAMPO GRANDE')).toMatch(/Santa Casa|H\./);
  });

  it('empty day message (AC empty)', () => {
    const msgs = buildDailyIssuedSummaryMessages({
      invoices: [],
      recipients: [GROUP],
      now: new Date('2026-09-05T21:00:00.000Z'),
      appBaseUrl: 'https://app.qlmed.com.br',
    });
    expect(msgs).toHaveLength(1);
    expect(msgs[0].jid).toBe(GROUP);
    expect(msgs[0].text).toContain('Nenhuma NF-e emitida hoje');
    expect(msgs[0].text).toContain('/fiscal/issued?from=');
  });

  it('sale-only header with CONSIG. line (SPEC-021)', () => {
    const msgs = buildDailyIssuedSummaryMessages({
      invoices: [
        {
          number: '65159',
          totalValue: 4800,
          cfop: '5102',
          cfopTag: 'Venda',
          recipientName: 'Cliente Venda',
          recipientCnpj: '111',
        },
        {
          number: '65160',
          totalValue: 5890.85,
          cfop: '1918',
          cfopTag: 'Consignação',
          recipientName: 'Cliente Consig',
          recipientCnpj: '222',
        },
      ],
      nicknames: { '111': 'Venda SA' },
      recipients: [GROUP],
      now: new Date('2026-09-05T21:00:00.000Z'),
    });
    expect(msgs).toHaveLength(1);
    const t = msgs[0].text;
    expect(t).toContain('*Notas de venda:*');
    expect(t.replace(/\u034f/g, '')).toMatch(/Notas de venda:\* 1/);
    expect(t).toContain('(CONSIG.)');
    expect(t).toContain('Venda SA');
  });

  it('Campo Grande date helpers', () => {
    // 21:00 UTC on Sep 5 ≈ 17:00 CG (UTC-4) — hour 17
    const d = new Date('2026-09-05T22:00:00.000Z'); // 18:00 CG
    expect(formatCampoGrandeDateISO(d)).toBe('2026-09-05');
    expect(hourInCampoGrande(d)).toBe(18);
  });

  it('split long messages with continuation header', () => {
    const invoices = Array.from({ length: 80 }, (_, i) => ({
      number: String(65000 + i),
      totalValue: 1234.56,
      cfop: '5102',
      cfopTag: 'Venda',
      recipientName: 'HOSPITAL UNIVERSITARIO MUITO LONGO PARA FORCAR PARTICAO DE MENSAGEM',
      recipientCnpj: String(i),
    }));
    const msgs = buildDailyIssuedSummaryMessages({
      invoices,
      recipients: [GROUP],
      now: new Date('2026-09-05T22:00:00.000Z'),
    });
    expect(msgs.length).toBeGreaterThan(1);
    expect(msgs[1].text).toContain('continuação');
  });
});
