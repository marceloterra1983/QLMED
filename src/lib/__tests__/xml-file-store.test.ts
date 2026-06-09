import { describe, expect, it } from 'vitest';

import { buildXmlFileName } from '../xml-file-store';

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
