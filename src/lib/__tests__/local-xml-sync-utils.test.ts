import { describe, expect, it } from 'vitest';

import { extractAccessKeyFromFilePath } from '../local-xml-sync/sync-utils';

describe('extractAccessKeyFromFilePath', () => {
  it('extracts a 44-digit NF-e or CT-e access key', () => {
    const accessKey = '50260607832309000197550020000647201004640326';

    expect(extractAccessKeyFromFilePath(`/backup/${accessKey}-nfe.xml`)).toBe(accessKey);
  });

  it('extracts a complete 50-digit NFS-e access key', () => {
    const accessKey = '50027041207832309000197000000000026026060676466565';

    expect(extractAccessKeyFromFilePath(`/backup/${accessKey}-nfse.xml`)).toBe(accessKey);
  });

  it('does not truncate unsupported numeric identifiers', () => {
    expect(extractAccessKeyFromFilePath('/backup/123456789012345678901234567890123456789012345.xml')).toBeNull();
    expect(extractAccessKeyFromFilePath('/backup/nota-sem-chave.xml')).toBeNull();
  });
});
