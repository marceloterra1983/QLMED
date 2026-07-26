import { afterEach, describe, expect, it } from 'vitest';
import { sefazRejectUnauthorized } from '@/lib/ssl-verify';

describe('sefazRejectUnauthorized', () => {
  const prev = process.env.SEFAZ_VERIFY_SSL;

  afterEach(() => {
    if (prev === undefined) delete process.env.SEFAZ_VERIFY_SSL;
    else process.env.SEFAZ_VERIFY_SSL = prev;
  });

  it('default é true (seguro)', () => {
    delete process.env.SEFAZ_VERIFY_SSL;
    expect(sefazRejectUnauthorized()).toBe(true);
  });

  it('só desliga com false explícito', () => {
    process.env.SEFAZ_VERIFY_SSL = 'false';
    expect(sefazRejectUnauthorized()).toBe(false);
    process.env.SEFAZ_VERIFY_SSL = 'true';
    expect(sefazRejectUnauthorized()).toBe(true);
  });
});
