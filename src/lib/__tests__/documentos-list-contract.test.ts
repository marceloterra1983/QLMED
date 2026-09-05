import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CERTIDAO_KINDS_ORDER, CERTIDAO_LABEL } from '@/lib/documentos/constants';
import { buildDocumentosListing } from '@/lib/documentos/list';

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  getSingleCompany: vi.fn(),
  userFindUnique: vi.fn(),
  documentFindMany: vi.fn(),
  ingestFindUnique: vi.fn(),
}));

vi.mock('@/lib/auth', async () => {
  const { NextResponse } = await import('next/server');
  return {
    requireAuth: mocks.requireAuth,
    unauthorizedResponse: () => NextResponse.json({ error: 'Não autorizado' }, { status: 401 }),
    forbiddenResponse: () => NextResponse.json({ error: 'Sem permissão' }, { status: 403 }),
  };
});

vi.mock('@/lib/single-company', () => ({
  getSingleCompany: mocks.getSingleCompany,
}));

vi.mock('@/lib/prisma', () => ({
  default: {
    user: { findUnique: mocks.userFindUnique },
    companyDocument: { findMany: mocks.documentFindMany },
    companyDocumentIngestState: { findUnique: mocks.ingestFindUnique },
  },
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn() }),
}));

import { GET } from '@/app/api/documentos/route';

const NOW = new Date('2026-09-04T18:00:00.000Z');

describe('buildDocumentosListing (SPEC-042 FR-002/003/006, AC-001/005)', () => {
  it('devolve exatamente 7 linhas na ordem CERTIDAO_KINDS_ORDER', () => {
    const listing = buildDocumentosListing([], null, NOW);
    expect(listing.certidoes).toHaveLength(7);
    expect(listing.certidoes.map((row) => row.kind)).toEqual([...CERTIDAO_KINDS_ORDER]);
    expect(listing.certidoes[3]?.kind).toBe('cnd_estadual_ms');
    expect(listing.certidoes[4]?.kind).toBe('cnd_estadual_mt');
  });

  it('tipo ausente: fileName null e status Não encontrada; sem history', () => {
    const listing = buildDocumentosListing([], null, NOW);
    for (const row of listing.certidoes) {
      expect(row.id).toBeNull();
      expect(row.fileName).toBeNull();
      expect(row.validUntil).toBeNull();
      expect(row.daysRemaining).toBeNull();
      expect(row.status).toEqual({ key: 'sem_data', label: 'Não encontrada' });
      expect(row).not.toHaveProperty('history');
      expect(row.label).toBe(CERTIDAO_LABEL[row.kind]);
    }
    expect(listing).not.toHaveProperty('outros');
  });

  it('vigente é o de maior validUntil; anteriores e removedAt não entram na listagem', () => {
    const listing = buildDocumentosListing(
      [
        {
          id: 'old',
          kind: 'cnd_federal',
          fileName: 'CERTIDAO RECEITA FEDERAL 06.07.26- QL MED.pdf',
          validUntil: '2026-07-06',
          validUntilSource: 'filename',
          removedAt: null,
        },
        {
          id: 'vigente',
          kind: 'cnd_federal',
          fileName: 'CERTIDAO RECEITA FEDERAL 12.12.26 - QL MED.pdf',
          validUntil: '2026-12-12',
          validUntilSource: 'filename',
          removedAt: null,
        },
        {
          id: 'removed',
          kind: 'cnd_federal',
          fileName: 'CERTIDAO RECEITA FEDERAL 31.12.26 - QL MED.pdf',
          validUntil: '2026-12-31',
          validUntilSource: 'filename',
          removedAt: '2026-01-01',
        },
        {
          id: 'fgts',
          kind: 'crf_fgts',
          fileName: 'CERTIDÃO FGTS 29.09.26 QL MED.pdf',
          validUntil: new Date('2026-09-29T00:00:00.000Z'),
          validUntilSource: 'filename',
          removedAt: null,
        },
      ],
      { lastSuccessAt: new Date('2026-09-04T13:00:00.000Z'), lastError: null },
      NOW,
    );

    const federal = listing.certidoes[0];
    expect(federal.id).toBe('vigente');
    expect(federal.fileName).toBe('CERTIDAO RECEITA FEDERAL 12.12.26 - QL MED.pdf');
    expect(federal.validUntil).toBe('2026-12-12');
    expect(federal.daysRemaining).toBe(99);
    expect(federal.status).toEqual({ key: 'ok', label: 'ok' });
    expect(federal).not.toHaveProperty('history');
    expect(listing.certidoes.map((row) => row.id)).not.toContain('old');
    expect(listing.certidoes.map((row) => row.id)).not.toContain('removed');

    const fgts = listing.certidoes[1];
    expect(fgts.id).toBe('fgts');
    expect(fgts.daysRemaining).toBe(25);
    expect(fgts.status).toEqual({ key: 'atencao', label: 'atenção' });

    expect(listing.certidoes[2].status.label).toBe('Não encontrada');
    expect(listing.ingest.lastSuccessAt).toBe('2026-09-04T13:00:00.000Z');
    expect(listing.ingest.lastError).toBeNull();
  });

  it('kind=outro não entra na listagem (fica no banco, invisível na página)', () => {
    const listing = buildDocumentosListing(
      [
        {
          id: 'trf',
          kind: 'outro',
          fileName: 'CERTIDÃO Tribunal Regional Federal da 3ª Região.pdf',
          validUntil: null,
          validUntilSource: null,
          removedAt: null,
        },
      ],
      null,
      NOW,
    );
    expect(listing).not.toHaveProperty('outros');
    expect(listing.certidoes.map((row) => row.id)).not.toContain('trf');
    expect(listing.certidoes.every((row) => row.kind !== 'outro')).toBe(true);
  });
});

describe('GET /api/documentos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockResolvedValue('user-1');
    mocks.getSingleCompany.mockResolvedValue({ id: 'company-1' });
    mocks.userFindUnique.mockResolvedValue({
      role: 'editor',
      allowedPages: ['/cadastro/documentos'],
    });
    mocks.documentFindMany.mockResolvedValue([]);
    mocks.ingestFindUnique.mockResolvedValue(null);
  });

  it('401 sem sessão', async () => {
    mocks.requireAuth.mockRejectedValue(new Error('NOT_AUTHENTICATED'));
    const res = await GET();
    expect(res.status).toBe(401);
    expect(mocks.documentFindMany).not.toHaveBeenCalled();
  });

  it('403 sem a página', async () => {
    mocks.userFindUnique.mockResolvedValue({ role: 'viewer', allowedPages: ['/cadastro/produtos'] });
    const res = await GET();
    expect(res.status).toBe(403);
    expect(mocks.documentFindMany).not.toHaveBeenCalled();
  });

  it('200 com 7 certidões na ordem fixa, daysRemaining/status do servidor, sem history/outros/companyId', async () => {
    mocks.documentFindMany.mockResolvedValue([
      {
        id: 'vigente',
        kind: 'cnd_federal',
        fileName: 'CERTIDAO RECEITA FEDERAL 12.12.26 - QL MED.pdf',
        validUntil: new Date('2026-12-12T00:00:00.000Z'),
        validUntilSource: 'filename',
        removedAt: null,
      },
      {
        id: 'old',
        kind: 'cnd_federal',
        fileName: 'CERTIDAO RECEITA FEDERAL 06.07.26- QL MED.pdf',
        validUntil: new Date('2026-07-06T00:00:00.000Z'),
        validUntilSource: 'filename',
        removedAt: null,
      },
    ]);
    mocks.ingestFindUnique.mockResolvedValue({
      lastSuccessAt: new Date('2026-09-04T13:00:00.000Z'),
      lastError: null,
    });

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.certidoes).toHaveLength(7);
    expect(body.certidoes.map((row: { kind: string }) => row.kind)).toEqual([...CERTIDAO_KINDS_ORDER]);
    expect(body.certidoes[0].id).toBe('vigente');
    expect(body.certidoes[0]).not.toHaveProperty('history');
    expect(body).not.toHaveProperty('outros');
    expect(typeof body.certidoes[0].daysRemaining).toBe('number');
    expect(body.certidoes[0].status).toEqual(
      expect.objectContaining({ key: expect.any(String), label: expect.any(String) }),
    );
    expect(body.certidoes[1].fileName).toBeNull();
    expect(body.certidoes[1].status.label).toBe('Não encontrada');
    expect(body.ingest.lastSuccessAt).toBe('2026-09-04T13:00:00.000Z');
    expect(body).not.toHaveProperty('companyId');
    expect(JSON.stringify(body)).not.toContain('companyId');
    expect(mocks.documentFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { companyId: 'company-1', removedAt: null } }),
    );
  });
});
