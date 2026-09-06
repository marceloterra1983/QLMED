import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getOpmePortalCredentialsFromEnv,
  parseBeneficiarioFromPortalText,
} from '@/lib/unimed-cg/opme-portal';

describe('unimed-cg opme portal', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('credenciais só via env (sem fallback)', () => {
    vi.stubEnv('UNIMED_CG_OPME_USERNAME', '');
    vi.stubEnv('UNIMED_CG_OPME_PASSWORD', '');
    expect(getOpmePortalCredentialsFromEnv()).toBeNull();

    vi.stubEnv('UNIMED_CG_OPME_USERNAME', 'qlmed2');
    vi.stubEnv('UNIMED_CG_OPME_PASSWORD', 'x');
    const creds = getOpmePortalCredentialsFromEnv();
    expect(creds?.username).toBe('qlmed2');
    expect(creds?.password).toBe('x');
  });

  it('extrai Beneficiário do texto do portal (regex verificado)', () => {
    const text = `
      Processo 75576
      Beneficiário
      DIEGO ABEL DA SILVA
      0051-0030-086726-00-0
      Local: UNIMED
    `;
    expect(parseBeneficiarioFromPortalText(text)).toBe('DIEGO ABEL DA SILVA');
  });
});
