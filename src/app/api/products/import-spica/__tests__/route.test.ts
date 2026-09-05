import { beforeEach, describe, expect, it, vi } from 'vitest';
import ExcelJS from 'exceljs';
import { parseSpicaRelCsv, checksumFileBytes, mapSpicaHeader } from '@/lib/spica/file-parse';

const mocks = vi.hoisted(() => ({
  requireEditor: vi.fn(),
  getOrCreateSingleCompany: vi.fn(),
  processSpicaRows: vi.fn(),
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
vi.mock('@/lib/spica/import-service', () => ({
  processSpicaRows: mocks.processSpicaRows,
}));

import { POST } from '@/app/api/products/import-spica/route';

function csvFile(content: string, name = 'Rel_Produtos.csv'): File {
  return new File([content], name, { type: 'text/csv' });
}

function requestWithForm(fields: Record<string, string | File>): Request {
  const formData = new FormData();
  for (const [k, v] of Object.entries(fields)) formData.set(k, v);
  return new Request('http://localhost/api/products/import-spica', { method: 'POST', body: formData });
}

const SAMPLE_CSV_QUOTED = [
  '"Código","Referência","Nome do Produto","Tipo","SubTipo","Fabricante","Fornecedor","Instrumental","RVS","NCM","Situação Tributária","Nome da Tributação","%ICMS","%PIS","%COFINS","%IPI Entr.","%IPI Saída","Obs. Fiscal"',
  '"5999","CAIXA OSSEA 101","(101) CAIXA","3 - ORTOPEDIA","CAIXAS","OSSEA","","Não","80071910005","90189099","000","000 - NACIONAL","17,00","0,65","3,00","0,00","0,00",""',
].join('\n');

describe('mapSpicaHeader / parseSpicaRelCsv', () => {
  it('mapeia cabeçalhos Rel_Produtos', () => {
    const map = mapSpicaHeader([
      'Código', 'Referência', 'Nome do Produto', 'Tipo', 'SubTipo', 'Fabricante',
      'Fornecedor', 'Instrumental', 'RVS', 'NCM', 'Situação Tributária', 'Nome da Tributação',
      '%ICMS', '%PIS', '%COFINS', '%IPI Entr.', '%IPI Saída', 'Obs. Fiscal',
    ]);
    expect(map?.codigo).toBe(0);
    expect(map?.referencia).toBe(1);
    expect(map?.nome).toBe(2);
    expect(map?.icms).toBe(12);
  });

  it('parseia CSV com aspas e alíquotas BR', () => {
    const rows = parseSpicaRelCsv(SAMPLE_CSV_QUOTED);
    expect(rows).toHaveLength(1);
    expect(rows[0].codigo).toBe('5999');
    expect(rows[0].referencia).toBe('CAIXA OSSEA 101');
    expect(rows[0].icms).toBe('17,00');
    expect(rows[0].pis).toBe('0,65');
  });
});

describe('POST /api/products/import-spica', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireEditor.mockResolvedValue({ userId: 'user-1', role: 'editor' });
    mocks.getOrCreateSingleCompany.mockResolvedValue({ id: 'company-1' });
    mocks.processSpicaRows.mockResolvedValue({
      summary: {
        totalRows: 1,
        inserted: 1,
        updatedExisting: 0,
        unchanged: 0,
        quarantinedDuplicates: 0,
        warningsCount: 0,
      },
      sampleUpdates: [{ codigo: '005999', ref: 'CAIXA OSSEA 101', action: 'INSERT_NEW', productKey: 'CODE:CAIXAOSSEA101::UNIT:UN' }],
    });
  });

  it('exige autenticacao de editor', async () => {
    mocks.requireEditor.mockRejectedValue(new Error('UNAUTHORIZED'));
    const res = await POST(requestWithForm({ file: csvFile(SAMPLE_CSV_QUOTED) }));
    expect(res.status).toBe(401);
  });

  it('dry-run default nao grava e devolve checksum + resumo', async () => {
    const res = await POST(requestWithForm({ file: csvFile(SAMPLE_CSV_QUOTED) }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.dryRun).toBe(true);
    expect(body.checksum).toMatch(/^[a-f0-9]{64}$/);
    expect(body.summary.totalRows).toBe(1);
    expect(body.summary.inserted).toBe(1);
    expect(body.samples).toHaveLength(1);
    expect(mocks.processSpicaRows).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ codigo: '5999' })]),
      expect.objectContaining({ companyId: 'company-1', dryRun: true }),
    );
  });

  it('apply sem confirmChecksum retorna 400', async () => {
    const res = await POST(requestWithForm({
      file: csvFile(SAMPLE_CSV_QUOTED),
      dryRun: 'false',
    }));
    expect(res.status).toBe(400);
    expect(mocks.processSpicaRows).not.toHaveBeenCalled();
  });

  it('apply com confirmChecksum correto grava', async () => {
    const file = csvFile(SAMPLE_CSV_QUOTED);
    const bytes = Buffer.from(await file.arrayBuffer());
    const checksum = checksumFileBytes(bytes);

    const res = await POST(requestWithForm({
      file,
      dryRun: 'false',
      confirmChecksum: checksum,
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.dryRun).toBe(false);
    expect(mocks.processSpicaRows).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({ dryRun: false }),
    );
  });

  it('aceita XLSX Rel_Produtos', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Rel');
    ws.addRow([
      'Código', 'Referência', 'Nome do Produto', 'Tipo', 'SubTipo', 'Fabricante',
      'Fornecedor', 'Instrumental', 'RVS', 'NCM', 'Situação Tributária', 'Nome da Tributação',
      '%ICMS', '%PIS', '%COFINS', '%IPI Entr.', '%IPI Saída', 'Obs. Fiscal',
    ]);
    ws.addRow([
      '5999', 'CAIXA OSSEA 101', '(101) CAIXA', '3 - ORTOPEDIA', 'CAIXAS', 'OSSEA',
      '', 'Não', '80071910005', '90189099', '000', '000 - NACIONAL',
      '17,00', '0,65', '3,00', '0,00', '0,00', '',
    ]);
    const buf = await wb.xlsx.writeBuffer();
    const file = new File([buf], 'Rel_Produtos.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    const res = await POST(requestWithForm({ file }));
    expect(res.status).toBe(200);
    expect(mocks.processSpicaRows).toHaveBeenCalled();
  });
});
