import { describe, expect, it } from 'vitest';
import { fmtCep, fmtCnpj, fmtDate, fmtFone, modFreteCode } from '@/lib/pdf/pdf-utils';

describe('PDF formatting helpers', () => {
  it('escapes unrecognized XML values before they reach generated HTML', () => {
    const payload = '<img src=x onerror=alert(1)>';

    expect(fmtCnpj(payload)).toContain('&lt;img');
    expect(fmtCep(payload)).toContain('&lt;img');
    expect(fmtFone(payload)).toContain('&lt;img');
    expect(modFreteCode(payload)).toContain('&lt;img');
    expect(fmtDate(payload)).toContain('&lt;img');
  });
});
