import { describe, expect, it } from 'vitest';
import { validateUrlForRender } from '@/lib/pdf/render-url';
import { UNIMED_CG_OPME_HOSTS } from '@/lib/unimed-cg/constants';

describe('unimed-cg render-url allowlist', () => {
  it('aceita host OPME', () => {
    const url = validateUrlForRender(
      'https://unimedcg.opmes.com.br/gestao/www/visualiza-email-processo.php?id=75576',
      UNIMED_CG_OPME_HOSTS,
    );
    expect(url.hostname).toBe('unimedcg.opmes.com.br');
  });

  it('rejeita host fora da allowlist sem lançar Puppeteer', () => {
    expect(() =>
      validateUrlForRender('https://evil.example/page', UNIMED_CG_OPME_HOSTS),
    ).toThrow();
  });
});
