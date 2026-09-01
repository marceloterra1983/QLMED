import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { decryptPfx, isEncryptedPfx } from '../certificate-secret';

const COMPANY_CNPJ = '11222333000181';
const OTHER_CNPJ = '99888777000166';

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  findUnique: vi.fn(),
  upsert: vi.fn(),
  processPfx: vi.fn(),
  getOrCreateSingleCompany: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  requireAdmin: mocks.requireAdmin,
  unauthorizedResponse: () => new Response(null, { status: 401 }),
  forbiddenResponse: () => new Response(null, { status: 403 }),
}));
vi.mock('@/lib/prisma', () => ({
  default: {
    company: { findUnique: mocks.findUnique },
    certificateConfig: { upsert: mocks.upsert },
  },
}));
vi.mock('@/lib/single-company', () => ({
  getOrCreateSingleCompany: mocks.getOrCreateSingleCompany,
}));
vi.mock('@/lib/certificate-manager', () => ({
  CertificateManager: {
    processPfx: mocks.processPfx,
    cleanCnpj: (v: string) => v.replace(/\D/g, ''),
  },
}));

import { POST } from '@/app/api/certificate/upload/route';

beforeAll(() => {
  process.env.ENCRYPTION_KEY = 'test-encryption-key-for-vitest-32chars!';
});

/** PFX falso: DER começa com SEQUENCE, como um PKCS#12 real. Nada real é lido. */
const FAKE_PFX = Buffer.concat([
  Buffer.from([0x30, 0x82, 0x04, 0x12]),
  Buffer.from('CHAVE-PRIVADA-FALSA', 'ascii'),
]);

function request(fields: Record<string, string> = {}) {
  const form = new FormData();
  form.append('file', new File([new Uint8Array(FAKE_PFX)], 'cert.pfx'), 'cert.pfx');
  form.append('password', 'senha-do-pfx');
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  return { formData: async () => form } as never;
}

function certInfo(overrides: Partial<{ cnpj: string | null; validTo: Date }> = {}) {
  return {
    serialNumber: '01',
    issuer: 'AC TESTE',
    subject: `CN=EMPRESA TESTE:${COMPANY_CNPJ}`,
    validFrom: new Date('2026-01-01'),
    validTo: new Date('2099-01-01'),
    cnpj: COMPANY_CNPJ,
    ...overrides,
  };
}

describe('POST /api/certificate/upload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdmin.mockResolvedValue({ userId: 'user-1' });
    mocks.getOrCreateSingleCompany.mockResolvedValue({ id: 'company-1', cnpj: COMPANY_CNPJ });
    mocks.findUnique.mockResolvedValue({ id: 'company-1', cnpj: COMPANY_CNPJ });
    mocks.upsert.mockResolvedValue({});
    mocks.processPfx.mockReturnValue(certInfo());
  });

  it('grava o pfxData cifrado, nunca os bytes do PFX', async () => {
    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
    const stored = mocks.upsert.mock.calls[0][0].create.pfxData as Buffer;

    expect(isEncryptedPfx(stored)).toBe(true);
    expect(stored.includes(FAKE_PFX)).toBe(false);
    expect(Buffer.compare(decryptPfx(stored, COMPANY_CNPJ), FAKE_PFX)).toBe(0);
  });

  it('amarra o blob ao CNPJ da empresa: outro CNPJ não decifra', async () => {
    await POST(request());
    const stored = mocks.upsert.mock.calls[0][0].create.pfxData as Buffer;

    expect(() => decryptPfx(stored, OTHER_CNPJ)).toThrow();
  });

  it('recusa 400 quando o CNPJ do certificado ≠ CNPJ da empresa', async () => {
    mocks.processPfx.mockReturnValue(certInfo({ cnpj: OTHER_CNPJ }));

    const response = await POST(request());

    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain('não corresponde');
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it('recusa 400 quando não dá para ler o CNPJ do certificado', async () => {
    mocks.processPfx.mockReturnValue(certInfo({ cnpj: null }));

    const response = await POST(request());

    expect(response.status).toBe(400);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it('recusa 400 um certificado já vencido', async () => {
    mocks.processPfx.mockReturnValue(certInfo({ validTo: new Date('2020-01-01') }));

    const response = await POST(request());

    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain('vencido');
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it('grava production por omissão e homologation quando pedido', async () => {
    await POST(request());
    expect(mocks.upsert.mock.calls[0][0].create.environment).toBe('production');

    vi.clearAllMocks();
    mocks.requireAdmin.mockResolvedValue({ userId: 'user-1' });
    mocks.getOrCreateSingleCompany.mockResolvedValue({ id: 'company-1', cnpj: COMPANY_CNPJ });
    mocks.findUnique.mockResolvedValue({ id: 'company-1', cnpj: COMPANY_CNPJ });
    mocks.upsert.mockResolvedValue({});
    mocks.processPfx.mockReturnValue(certInfo());

    await POST(request({ environment: 'homologation' }));
    expect(mocks.upsert.mock.calls[0][0].create.environment).toBe('homologation');
  });

  it('recusa um ambiente fora do enum em vez de cair em production', async () => {
    const response = await POST(request({ environment: 'homologacao' }));

    expect(response.status).toBe(400);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});
