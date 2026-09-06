import { describe, expect, it, vi, beforeEach } from 'vitest';
import { isPdfItem, type OneDriveItem } from '@/lib/onedrive-client';
import { createOneDriveFolderPort } from '@/lib/onedrive-folder-port';

vi.mock('@/lib/onedrive-connections', () => ({
  resolveAccountOneDrive: vi.fn(),
}));

vi.mock('@/lib/onedrive-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/onedrive-client')>();
  return {
    ...actual,
    ensureOneDriveFolder: vi.fn(),
    listOneDriveChildren: vi.fn(),
    downloadOneDriveItemContent: vi.fn(),
  };
});

import { resolveAccountOneDrive } from '@/lib/onedrive-connections';
import {
  ensureOneDriveFolder,
  listOneDriveChildren,
  downloadOneDriveItemContent,
} from '@/lib/onedrive-client';

describe('isPdfItem predicate', () => {
  it('rejeita pastas mesmo com .pdf no nome', () => {
    const item: OneDriveItem = { id: 'f-1', name: 'relatorio.pdf', folder: { childCount: 1 } };
    expect(isPdfItem(item)).toBe(false);
  });

  it('aceita arquivos com extensão .pdf ou .PDF', () => {
    expect(isPdfItem({ id: '1', name: 'oficio.pdf' })).toBe(true);
    expect(isPdfItem({ id: '2', name: 'OFICIO.PDF' })).toBe(true);
  });

  it('aceita arquivos sem extensão .pdf mas com mimeType application/pdf', () => {
    expect(isPdfItem({ id: '3', name: 'oficio-sem-ext', file: { mimeType: 'application/pdf' } })).toBe(true);
  });

  it('rejeita arquivos não-PDF', () => {
    expect(isPdfItem({ id: '4', name: 'planilha.xlsx' })).toBe(false);
    expect(isPdfItem({ id: '5', name: 'dados.json', file: { mimeType: 'application/json' } })).toBe(false);
  });
});

describe('createOneDriveFolderPort Deep Module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('inicializa com a conta e pasta configuradas e lista apenas arquivos PDF', async () => {
    vi.mocked(resolveAccountOneDrive).mockResolvedValue({
      accessToken: 'token-123',
      driveId: 'drive-abc',
      accountEmail: 'faturamento@qlmed.com.br',
    });
    vi.mocked(ensureOneDriveFolder).mockResolvedValue({
      id: 'folder-id-xyz',
      name: 'IMPCG',
    });
    vi.mocked(listOneDriveChildren).mockResolvedValue([
      { id: 'item-1', name: 'oficio-1.pdf', lastModifiedDateTime: '2026-09-01T10:00:00.000Z' },
      { id: 'sub-folder', name: 'subpasta', folder: { childCount: 0 } },
      { id: 'item-2', name: 'relatorio.docx' },
      { id: 'item-3', name: 'oficio-2.PDF', lastModifiedDateTime: '2026-09-02T12:00:00.000Z' },
    ]);

    const port = await createOneDriveFolderPort({
      companyId: 'company-1',
      accountEmail: 'faturamento@qlmed.com.br',
      folderName: '1 - DOCUMENTOS/0 - AUTORIZACOES/IMPCG',
      errorMessage: 'conta não conectada',
    });

    expect(resolveAccountOneDrive).toHaveBeenCalledWith('company-1', 'faturamento@qlmed.com.br', {
      allowFallback: undefined,
      errorMessage: 'conta não conectada',
    });
    expect(ensureOneDriveFolder).toHaveBeenCalledWith('token-123', 'drive-abc', '1 - DOCUMENTOS/0 - AUTORIZACOES/IMPCG');

    const pdfs = await port.listPdfs();
    expect(pdfs).toEqual([
      {
        itemId: 'item-1',
        name: 'oficio-1.pdf',
        lastModifiedAt: new Date('2026-09-01T10:00:00.000Z'),
      },
      {
        itemId: 'item-3',
        name: 'oficio-2.PDF',
        lastModifiedAt: new Date('2026-09-02T12:00:00.000Z'),
      },
    ]);
  });

  it('downloadPdf delega diretamente ao download do cliente OneDrive', async () => {
    vi.mocked(resolveAccountOneDrive).mockResolvedValue({
      accessToken: 'token-123',
      driveId: 'drive-abc',
      accountEmail: 'faturamento@qlmed.com.br',
    });
    vi.mocked(ensureOneDriveFolder).mockResolvedValue({
      id: 'folder-id-xyz',
      name: 'CASSEMS',
    });
    const fakeBuffer = Buffer.from('%PDF-1.4 test content');
    vi.mocked(downloadOneDriveItemContent).mockResolvedValue(fakeBuffer);

    const port = await createOneDriveFolderPort({
      companyId: 'company-1',
      accountEmail: 'faturamento@qlmed.com.br',
      folderName: '1 - DOCUMENTOS/0 - AUTORIZACOES/CASSEMS',
    });

    const content = await port.downloadPdf('item-123');
    expect(downloadOneDriveItemContent).toHaveBeenCalledWith('token-123', 'drive-abc', 'item-123');
    expect(content).toBe(fakeBuffer);
  });
});
