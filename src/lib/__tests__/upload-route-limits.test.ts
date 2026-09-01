import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseXmlSafe } from '@/lib/safe-xml-parser';

/**
 * Prova ponta-a-ponta: o corpo hostil vira 413 na rota, não 500 nem OOM.
 */

const mocks = vi.hoisted(() => ({
  requireEditor: vi.fn(),
  getOrCreateSingleCompany: vi.fn(),
  companyFindFirst: vi.fn(),
  loggerError: vi.fn(),
}));

vi.mock('@/lib/auth', async () => {
  const { NextResponse } = await import('next/server');
  return {
    requireEditor: mocks.requireEditor,
    unauthorizedResponse: () => NextResponse.json({ error: 'Não autorizado' }, { status: 401 }),
    forbiddenResponse: () => NextResponse.json({ error: 'Sem permissão' }, { status: 403 }),
  };
});
vi.mock('@/lib/single-company', () => ({
  getOrCreateSingleCompany: mocks.getOrCreateSingleCompany,
}));
vi.mock('@/lib/prisma', () => ({
  default: { company: { findFirst: mocks.companyFindFirst } },
  prisma: { company: { findFirst: mocks.companyFindFirst } },
}));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ error: mocks.loggerError, warn: vi.fn(), info: vi.fn() }),
}));

import { POST as uploadInvoices } from '@/app/api/invoices/upload/route';
import { POST as importTypes } from '@/app/api/products/import-types/route';

/** Corpo interminável: se o cap não valer, o teste estoura sozinho. */
function endlessRequest(): Request {
  let delivered = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      delivered += 64 * 1024;
      if (delivered > 400 * 1024 * 1024) {
        controller.error(new Error('rota nunca cortou o corpo'));
        return;
      }
      controller.enqueue(new Uint8Array(64 * 1024));
    },
  });
  return new Request('http://localhost/api/upload', {
    method: 'POST',
    body: stream,
    headers: { 'content-type': 'multipart/form-data; boundary=----x' },
    ...({ duplex: 'half' } as Record<string, unknown>),
  });
}

describe('rotas de upload recusam corpo hostil com 413 (FILE-001/002/006)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireEditor.mockResolvedValue({ userId: 'user-1', role: 'editor' });
    mocks.getOrCreateSingleCompany.mockResolvedValue({ id: 'company-1' });
    mocks.companyFindFirst.mockResolvedValue({ id: 'company-1', cnpj: '07832309000197' });
  });

  it('POST /api/invoices/upload devolve 413 sem bufferizar o corpo inteiro', async () => {
    const response = await uploadInvoices(endlessRequest());

    expect(response.status).toBe(413);
  });

  it('POST /api/products/import-types devolve 413 sem bufferizar o corpo inteiro', async () => {
    const response = await importTypes(endlessRequest());

    expect(response.status).toBe(413);
  });
});

describe('XML hostil (fixtures sintéticas, nenhum XML fiscal real)', () => {
  it('recusa DOCTYPE (XXE) antes de parsear', async () => {
    const xxe = `<?xml version="1.0"?>
<!DOCTYPE foo [ <!ENTITY xxe SYSTEM "file:///etc/passwd"> ]>
<nfeProc><infNFe>&xxe;</infNFe></nfeProc>`;

    await expect(parseXmlSafe(xxe)).rejects.toThrow(/DOCTYPE/);
  });

  it('recusa DOCTYPE em caixa mista e com espaço', async () => {
    await expect(parseXmlSafe('<!doctype x><a/>')).rejects.toThrow(/DOCTYPE/);
    await expect(parseXmlSafe('<?xml version="1.0"?>\n  <!DoCtYpE x><a/>')).rejects.toThrow(/DOCTYPE/);
  });

  it('recusa XML acima do cap de tamanho', async () => {
    const huge = `<a>${'x'.repeat(11 * 1024 * 1024)}</a>`;

    await expect(parseXmlSafe(huge)).rejects.toThrow(/limite/);
  });

  it('ainda parseia um XML pequeno e bem formado', async () => {
    await expect(parseXmlSafe('<nfeProc><infNFe>ok</infNFe></nfeProc>')).resolves.toBeTruthy();
  });
});
