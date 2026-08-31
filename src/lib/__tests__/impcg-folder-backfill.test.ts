import { Decimal } from '@prisma/client-runtime-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GraphMailboxError } from '@/lib/graph-mail-client';
import type { ImpcgIngestDeps, ImpcgStorePort, PersistArgs } from '@/lib/impcg/ingest';

const OFICIO_17673_TEXT = `
INSTITUTO MUNICIPAL DE PREVIDENCIA DE CAMPO GRANDE
ORDEM DE FORNECIMENTO N 17673
DATA: 10/08/2023
PACIENTE: PLINIO ANTONIO ARANHA JUNIOR
MATRICULA: 66429737-4
MEDICO: RODRIGO LUIZ ROCHA CARDOSO
CRM: 13716
PROCEDIMENTO: TROCA VALVAR
LOCAL DE ENTREGA: HOSPITAL PRONCOR
ITENS APROVADOS
DESCRICAO                              MARCA       REF      QTD   UNITARIO     TOTAL
KIT VALVULA AORTICA MECANICA           SORIN       A5         1    6.500,00    6.500,00
KIT CEC                                EUROSETS    AG5214     1    5.500,00    5.500,00
KIT CANULAS                            BIOMEDICAL  KITPER     1      550,00      550,00
TOTAL GERAL: 12.550,00
`.trim();

type AuthRow = {
  id: string;
  oficioNumber: string;
  parseStatus: 'ok' | 'parcial' | 'falha';
  patientName: string;
  oneDriveItemId: string;
  issuedAt: Date | null;
  doctorName?: string | null;
  doctorCrm?: string | null;
  totalCents: number;
  itemCount: number;
};

const memory = vi.hoisted(() => ({
  authorizations: [] as AuthRow[],
  seq: 1,
}));

const ports = vi.hoisted(() => ({
  listMessages: vi.fn(),
  getPdfAttachments: vi.fn(),
  uploadPdf: vi.fn(),
  listPdfs: vi.fn(),
  downloadPdf: vi.fn(),
  extractText: vi.fn(),
}));

vi.mock('@/lib/postgres-advisory-lock', () => ({
  acquirePostgresAdvisoryLock: vi.fn(async () => ({ release: async () => undefined })),
  impcgMailIngestLockKey: (companyId: string) => `impcg-mail-ingest:${companyId}`,
}));

function resetMemory() {
  memory.authorizations.length = 0;
  memory.seq = 1;
}

function memoryStore(): ImpcgStorePort {
  return {
    async findSourceByInternetMessageId() {
      return null;
    },
    async findByOficioNumber(_companyId, oficioNumber) {
      return memory.authorizations.find((row) => row.oficioNumber === oficioNumber) ?? null;
    },
    async persistConfirmed(input: PersistArgs) {
      const id = `auth-${memory.seq++}`;
      memory.authorizations.push({
        id,
        oficioNumber: input.oficioNumber,
        parseStatus: input.parseStatus,
        patientName: input.patientName,
        oneDriveItemId: input.oneDriveItemId,
        issuedAt: input.issuedAt,
        doctorName: input.doctorName,
        doctorCrm: input.doctorCrm,
        totalCents: input.totalCents,
        itemCount: input.items.length,
      });
      return { id };
    },
    async persistUpgrade(input: PersistArgs & { authorizationId: string }) {
      const row = memory.authorizations.find((item) => item.id === input.authorizationId);
      if (!row) throw new Error('authorization missing');
      row.parseStatus = input.parseStatus;
      row.patientName = input.patientName;
      row.oneDriveItemId = input.oneDriveItemId;
      row.issuedAt = input.issuedAt;
      row.doctorName = input.doctorName;
      row.doctorCrm = input.doctorCrm;
      row.totalCents = input.totalCents;
      row.itemCount = input.items.length;
    },
    async persistIssuedAt(authorizationId: string, issuedAt: Date) {
      const row = memory.authorizations.find((item) => item.id === authorizationId);
      if (!row) throw new Error('authorization missing');
      row.issuedAt = issuedAt;
    },
    async persistSourceOnly() {},
    async loadIngestState() {
      return null;
    },
    async saveIngestState() {},
  };
}

function folderFile() {
  return {
    itemId: 'od-folder-17673',
    name: 'OFICIO 17673 PLINIO ANTONIO ARANHA JUNIOR.pdf',
    lastModifiedAt: new Date('2023-08-10T15:00:00.000Z'),
  };
}

function deps(): ImpcgIngestDeps {
  return {
    mail: {
      listMessages: ports.listMessages,
      getPdfAttachments: ports.getPdfAttachments,
    },
    drive: { uploadPdf: ports.uploadPdf },
    folder: {
      listPdfs: ports.listPdfs,
      downloadPdf: ports.downloadPdf,
    },
    extractText: ports.extractText,
    store: memoryStore(),
  };
}

describe('ingest IMPCG — varredura da pasta OneDrive', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMemory();
    ports.listMessages.mockResolvedValue([]);
    ports.getPdfAttachments.mockResolvedValue([]);
    ports.uploadPdf.mockResolvedValue({ itemId: 'should-not-upload' });
    ports.listPdfs.mockResolvedValue([folderFile()]);
    ports.downloadPdf.mockResolvedValue(Buffer.from('%PDF-1.4 fixture'));
    ports.extractText.mockResolvedValue(OFICIO_17673_TEXT);
  });

  it('arquivo 17673 já na pasta cria uma linha sem reenviar (AC-013)', async () => {
    const { runImpcgIngest } = await import('@/lib/impcg/ingest');
    const result = await runImpcgIngest('co1', deps());

    expect(memory.authorizations).toHaveLength(1);
    expect(memory.authorizations[0]?.oficioNumber).toBe('17673');
    expect(memory.authorizations[0]?.patientName).toBe('PLINIO ANTONIO ARANHA JUNIOR');
    expect(memory.authorizations[0]?.oneDriveItemId).toBe('od-folder-17673');
    expect(memory.authorizations[0]?.itemCount).toBe(3);
    expect(memory.authorizations[0]?.totalCents).toBe(1255000);
    expect(new Decimal(memory.authorizations[0]?.totalCents ?? 0).div(100).toFixed(2)).toBe('12550.00');
    expect(ports.uploadPdf).not.toHaveBeenCalled();
    expect(ports.downloadPdf).toHaveBeenCalledWith('od-folder-17673');
    expect(result.processed).toBe(1);
    expect(result.failedUploads).toBe(0);
  });

  it('segunda varredura do mesmo PDF não duplica o ofício', async () => {
    const { runImpcgIngest } = await import('@/lib/impcg/ingest');
    await runImpcgIngest('co1', deps());
    const second = await runImpcgIngest('co1', deps());

    expect(memory.authorizations).toHaveLength(1);
    expect(memory.authorizations[0]?.oficioNumber).toBe('17673');
    expect(second.processed).toBe(0);
    expect(second.skipped).toBeGreaterThan(0);
    expect(ports.uploadPdf).not.toHaveBeenCalled();
  });

  it('Graph Mail 403 ainda importa o PDF da pasta', async () => {
    ports.listMessages.mockRejectedValue(new GraphMailboxError('Forbidden', 403));

    const { runImpcgIngest } = await import('@/lib/impcg/ingest');
    const result = await runImpcgIngest('co1', deps());

    expect(result.failedMailboxes).toEqual(['marcelo', 'flavio']);
    expect(memory.authorizations).toHaveLength(1);
    expect(memory.authorizations[0]?.oficioNumber).toBe('17673');
    expect(ports.uploadPdf).not.toHaveBeenCalled();
    expect(result.ok).toBe(true);
    expect(result.processed).toBe(1);
  });

  it('ok com data da OBS é corrigido para o fechamento Campo Grande', async () => {
    memory.authorizations.push({
      id: 'auth-mara',
      oficioNumber: '16404',
      parseStatus: 'ok',
      patientName: 'MARA MARCIA FERNANDES DE MORAES',
      oneDriveItemId: 'od-folder-16404',
      issuedAt: new Date('2025-12-18T00:00:00.000Z'),
      totalCents: 335000,
      itemCount: 2,
    });
    ports.listPdfs.mockResolvedValue([{
      itemId: 'od-folder-16404',
      name: 'OFICIO 16404 MARA MARCIA FERNANDES DE MORAES.pdf',
      lastModifiedAt: new Date('2026-01-23T14:48:00.000Z'),
    }]);
    ports.extractText.mockResolvedValue(`
INSTITUTO MUNICIPAL DE PREVIDENCIA DE CAMPO GRANDE
ORDEM DE FORNECIMENTO N 16404
PACIENTE: MARA MARCIA FERNANDES DE MORAES
MEDICO: CLAUDIO ALBERNAZ CESAR
CRM: 3947
PROCEDIMENTO: REVASCULARIZACAO
LOCAL DE ENTREGA: HOSPITAL CLINICA CAMPO GRANDE
KIT TESTE MARCA REF 1 3.350,00 3.350,00
TOTAL GERAL: 3.350,00
OBS: PROCEDIMENTO REALIZADO NA URGENCIA EM 18/12/2025
Campo Grande, 22 de janeiro de 2026.
`);

    const { runImpcgIngest } = await import('@/lib/impcg/ingest');
    const result = await runImpcgIngest('co1', deps());

    expect(memory.authorizations).toHaveLength(1);
    expect(memory.authorizations[0]?.issuedAt?.toISOString().slice(0, 10)).toBe('2026-01-22');
    expect(result.processed).toBe(1);
  });

  it('parcial sem data é relido e preenche issuedAt', async () => {
    memory.authorizations.push({
      id: 'auth-parcial',
      oficioNumber: '17673',
      parseStatus: 'parcial',
      patientName: 'PLINIO ANTONIO ARANHA JUNIOR',
      oneDriveItemId: 'od-folder-17673',
      issuedAt: null,
      totalCents: 1255000,
      itemCount: 3,
    });

    const { runImpcgIngest } = await import('@/lib/impcg/ingest');
    const result = await runImpcgIngest('co1', deps());

    expect(memory.authorizations).toHaveLength(1);
    expect(memory.authorizations[0]?.parseStatus).toBe('ok');
    expect(memory.authorizations[0]?.issuedAt?.toISOString().slice(0, 10)).toBe('2023-08-10');
    expect(result.processed).toBe(1);
    expect(ports.uploadPdf).not.toHaveBeenCalled();
  });

  it('parcial sem médico é relido e preenche doctorName (layout MÉDICO DR.)', async () => {
    memory.authorizations.push({
      id: 'auth-no-doc',
      oficioNumber: '1589',
      parseStatus: 'parcial',
      patientName: 'PAULO ROBERTO LOUREIRO PINHEIRO',
      oneDriveItemId: 'od-1589',
      issuedAt: new Date('2018-01-01T00:00:00.000Z'),
      doctorName: null,
      doctorCrm: null,
      totalCents: 899000,
      itemCount: 5,
    });
    ports.listPdfs.mockResolvedValue([
      {
        itemId: 'od-1589',
        name: 'OFICIO 1589 PAULO ROBERTO LOUREIRO PINHEIRO.pdf',
        lastModifiedAt: new Date('2018-01-01T00:00:00.000Z'),
      },
    ]);
    ports.extractText.mockResolvedValue(`
OFÍCIO Nº 1589
PACIENTE: PAULO ROBERTO LOUREIRO PINHEIRO
MÉDICO DR. ARINO FARIA DA SILVA
LOCAL DE ENTREGA: HOSPITAL EL KADRI
KIT TESTE MARCA REF 1 10,00 10,00
TOTAL R$ 10,00
`);

    const { runImpcgIngest } = await import('@/lib/impcg/ingest');
    const result = await runImpcgIngest('co1', deps());

    expect(memory.authorizations[0]?.doctorName).toBe('ARINO FARIA DA SILVA');
    expect(result.processed).toBe(1);
  });

  it('OCR vazio não inventa itens — persiste falha com número do arquivo', async () => {
    ports.extractText.mockResolvedValue('');

    const { runImpcgIngest } = await import('@/lib/impcg/ingest');
    await runImpcgIngest('co1', deps());

    expect(memory.authorizations).toHaveLength(1);
    expect(memory.authorizations[0]?.oficioNumber).toBe('17673');
    expect(memory.authorizations[0]?.patientName).toBe('PLINIO ANTONIO ARANHA JUNIOR');
    expect(memory.authorizations[0]?.parseStatus).toBe('falha');
    expect(memory.authorizations[0]?.itemCount).toBe(0);
    expect(memory.authorizations[0]?.totalCents).toBe(0);
  });
});
