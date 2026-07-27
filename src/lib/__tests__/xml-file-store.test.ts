import { describe, expect, it } from 'vitest';

import { buildXmlFileName, resolveInvoiceXmlContent } from '../xml-file-store';

describe('buildXmlFileName', () => {
  it('builds names for supported fiscal access keys', () => {
    expect(buildXmlFileName('50260607832309000197550020000647201004640326', 'NFE'))
      .toBe('50260607832309000197550020000647201004640326-nfe.xml');
    expect(buildXmlFileName('NFSE-07832309000197-260', 'NFSE'))
      .toBe('NFSE-07832309000197-260-nfse.xml');
  });

  it('rejects path traversal and unsafe suffixes', () => {
    expect(buildXmlFileName('../../../tmp/invoice', 'NFE')).toBeNull();
    expect(buildXmlFileName('safe-key', '../../outside')).toBeNull();
  });
});

describe('resolveInvoiceXmlContent', () => {
  it('faz fallback para xmlContent quando não há arquivo', async () => {
    const xml = await resolveInvoiceXmlContent({
      accessKey: 'KEY_THAT_DOES_NOT_EXIST_ON_DISK_999',
      type: 'NFE',
      issueDate: new Date('2026-01-15'),
      xmlContent: '<nfe>ok</nfe>',
    });
    expect(xml).toBe('<nfe>ok</nfe>');
  });
});
