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
    expect(listing.sanitaria).toHaveLength(6);
    expect(listing.cartas).toEqual([]);
    expect(listing.societario).toHaveLength(3);
    expect(listing.basicos).toHaveLength(6);
    expect(listing.balancos).toEqual([]);
    expect(listing.sanitaria.map((row) => row.kind)).toEqual([
      'alvara_funcionamento',
      'licenca_sanitaria',
      'licenca_sanitaria_veiculo',
      'crf_conselho',
      'controle_pragas',
      'afe_anvisa',
    ]);
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
    expect(fgts.automacao).toBe('automatica');
    expect(federal.automacao).toBe('manual');
    expect(listing.certidoes.find((row) => row.kind === 'cnd_municipal_mobiliario')?.automacao).toBe('assistida');
    expect(listing.shareRecipients.map((row) => row.label)).toEqual([
      'Faturamento',
      'Marcelo',
      'Daniele',
      'Flavio',
      'José Roberto',
    ]);

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

  it('AFE vigente mostra não vence e ignora data no nome', () => {
    const listing = buildDocumentosListing(
      [
        {
          id: 'afe',
          kind: 'afe_anvisa',
          category: 'sanitaria',
          fileName: 'AFE - EMITIDO EM 06.01.2026.pdf',
          validUntil: '2026-01-06',
          validUntilSource: 'filename',
          removedAt: null,
        },
      ],
      null,
      NOW,
    );
    const afe = listing.sanitaria.find((row) => row.kind === 'afe_anvisa');
    expect(afe?.id).toBe('afe');
    expect(afe?.expira).toBe(false);
    expect(afe?.daysRemaining).toBeNull();
    expect(afe?.validUntil).toBeNull();
    expect(afe?.status).toEqual({ key: 'nao_vence', label: 'não vence' });
    expect(afe?.automacao).toBeNull();
  });

  it('cartas: uma linha por ficheiro, sem data no fim, fabricante no rótulo', () => {
    const listing = buildDocumentosListing(
      [
        {
          id: 'sem-data',
          kind: 'carta_comercializacao',
          category: 'carta',
          fileName: 'Carta Comercialização TECHIMPORT.pdf',
          validUntil: null,
          validUntilSource: null,
          removedAt: null,
        },
        {
          id: 'com-data',
          kind: 'carta_comercializacao',
          category: 'carta',
          fileName: 'Carta de Autorização Comercialização OSTEOMED QL 15.08.24.pdf',
          validUntil: '2024-08-15',
          validUntilSource: 'filename',
          removedAt: null,
        },
      ],
      null,
      NOW,
    );
    expect(listing.cartas.map((row) => row.id)).toEqual(['com-data', 'sem-data']);
    expect(listing.cartas[0]?.label).toBe('OSTEOMED');
    expect(listing.cartas[1]?.label).toBe('TECHIMPORT');
    expect(listing.cartas[1]?.daysRemaining).toBeNull();
  });

  it('Cartão CNPJ vigente é o de maior data mesmo com expira: false (31.08.26)', () => {
    const listing = buildDocumentosListing(
      [
        {
          id: 'cnpj-nov',
          kind: 'cartao_cnpj',
          category: 'basicos',
          fileName: 'CARTÃO CNPJ 13.11.25.pdf',
          validUntil: '2025-11-13',
          validUntilSource: 'filename',
          removedAt: null,
        },
        {
          id: 'cnpj-mar',
          kind: 'cartao_cnpj',
          category: 'basicos',
          fileName: 'CARTÃO CNPJ 16.03.26.pdf',
          validUntil: '2026-03-16',
          validUntilSource: 'filename',
          removedAt: null,
        },
        {
          id: 'cnpj-ago',
          kind: 'cartao_cnpj',
          category: 'basicos',
          fileName: 'CARTÃO CNPJ 31.08.26.pdf',
          validUntil: '2026-08-31',
          validUntilSource: 'filename',
          removedAt: null,
        },
      ],
      null,
      NOW,
    );
    const cnpj = listing.basicos.find((row) => row.kind === 'cartao_cnpj');
    expect(cnpj?.id).toBe('cnpj-ago');
    expect(cnpj?.fileName).toBe('CARTÃO CNPJ 31.08.26.pdf');
    expect(cnpj?.expira).toBe(false);
    expect(cnpj?.daysRemaining).toBeNull();
    expect(cnpj?.validUntil).toBeNull();
    expect(cnpj?.status).toEqual({ key: 'nao_vence', label: 'não vence' });
  });

  it('balanços: uma linha por ano, DESC, sem prazo', () => {
    const listing = buildDocumentosListing(
      [
        {
          id: 'b-2024',
          kind: 'balanco_anual',
          category: 'balanco',
          fileName: 'BALANÇO 2024',
          validUntil: null,
          validUntilSource: null,
          removedAt: null,
          webUrl: 'https://onedrive.example/2024',
        },
        {
          id: 'b-2026',
          kind: 'balanco_anual',
          category: 'balanco',
          fileName: 'BALANÇO 2026',
          validUntil: null,
          validUntilSource: null,
          removedAt: null,
          webUrl: 'https://onedrive.example/2026',
        },
        {
          id: 'b-2025',
          kind: 'balanco_anual',
          category: 'balanco',
          fileName: 'BALANÇO 2025',
          validUntil: null,
          validUntilSource: null,
          removedAt: null,
          webUrl: 'https://onedrive.example/2025',
        },
      ],
      null,
      NOW,
    );
    expect(listing.balancos.map((row) => row.label)).toEqual(['2026', '2025', '2024']);
    expect(listing.balancos.every((row) => row.daysRemaining == null)).toBe(true);
    expect(listing.balancos.every((row) => row.validUntil == null)).toBe(true);
    expect(listing.balancos[0]?.webUrl).toBe('https://onedrive.example/2026');
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
    expect(body.sanitaria).toHaveLength(6);
    expect(body.sanitaria.map((row: { kind: string }) => row.kind)).toEqual([
      'alvara_funcionamento',
      'licenca_sanitaria',
      'licenca_sanitaria_veiculo',
      'crf_conselho',
      'controle_pragas',
      'afe_anvisa',
    ]);
    expect(body.cartas).toEqual([]);
    expect(body.ingest.lastSuccessAt).toBe('2026-09-04T13:00:00.000Z');
    expect(body).not.toHaveProperty('companyId');
    expect(JSON.stringify(body)).not.toContain('companyId');
    expect(mocks.documentFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { companyId: 'company-1', removedAt: null } }),
    );
  });
});
