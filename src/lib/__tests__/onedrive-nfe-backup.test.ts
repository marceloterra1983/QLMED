import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { resolveAccountOneDrive, ensureOneDriveFolder, uploadOneDriveFile } = vi.hoisted(() => ({
  resolveAccountOneDrive: vi.fn(async () => ({ accessToken: 'tok', driveId: 'drive-1' })),
  ensureOneDriveFolder: vi.fn(async () => ({ id: 'folder-1' })),
  uploadOneDriveFile: vi.fn(async () => ({ id: 'item-1', name: 'file' })),
}));

vi.mock('@/lib/onedrive-connections', () => ({ resolveAccountOneDrive }));
vi.mock('@/lib/onedrive-client', () => ({ ensureOneDriveFolder, uploadOneDriveFile }));

import {
  issuedOneDrivePdfFolder,
  issuedOneDriveXmlFolder,
  uploadIssuedNfeToOneDrive,
} from '@/lib/nfe-emission/onedrive-backup';

const ACCESS_KEY = '50260907832309000197550020000652541658056263';
const INVOICE_NUMBER = '65254';
const XML_STUB = '<nfeProc/>';

describe('onedrive NF-e backup', () => {
  const prevXml = process.env.LOCAL_XML_ONEDRIVE_XML_PATH;
  const prevPdf = process.env.LOCAL_XML_ONEDRIVE_PDF_PATH;

  beforeEach(() => {
    delete process.env.LOCAL_XML_ONEDRIVE_XML_PATH;
    delete process.env.LOCAL_XML_ONEDRIVE_PDF_PATH;
    resolveAccountOneDrive.mockReset();
    ensureOneDriveFolder.mockReset();
    uploadOneDriveFile.mockReset();
    resolveAccountOneDrive.mockResolvedValue({ accessToken: 'tok', driveId: 'drive-1' });
    ensureOneDriveFolder.mockResolvedValue({ id: 'folder-1' });
    uploadOneDriveFile.mockResolvedValue({ id: 'item-1', name: 'file' });
  });

  afterEach(() => {
    if (prevXml === undefined) delete process.env.LOCAL_XML_ONEDRIVE_XML_PATH;
    else process.env.LOCAL_XML_ONEDRIVE_XML_PATH = prevXml;
    if (prevPdf === undefined) delete process.env.LOCAL_XML_ONEDRIVE_PDF_PATH;
    else process.env.LOCAL_XML_ONEDRIVE_PDF_PATH = prevPdf;
  });

  it('monta pasta XML com YYYY_MM da emissão', () => {
    expect(issuedOneDriveXmlFolder('2026-09-08')).toBe('/BACKUP_QL MED/NFE/XML/2026_09');
  });

  it('monta pasta DANFE com YYYY_MM da emissão', () => {
    expect(issuedOneDrivePdfFolder('2026-09-08')).toBe('/BACKUP_QL MED/NFE/Danfes/2026_09');
  });

  it('faz upload do XML com contentType application/xml', async () => {
    const result = await uploadIssuedNfeToOneDrive({
      companyId: 'co1',
      accessKey: ACCESS_KEY,
      invoiceNumber: INVOICE_NUMBER,
      issueDate: '2026-09-08',
      xml: XML_STUB,
    });

    expect(result.xmlPath).toBe(
      `/BACKUP_QL MED/NFE/XML/2026_09/${ACCESS_KEY}-nfe.xml`,
    );
    expect(ensureOneDriveFolder).toHaveBeenCalledWith('tok', 'drive-1', '/BACKUP_QL MED/NFE/XML/2026_09');
    expect(uploadOneDriveFile).toHaveBeenCalledTimes(1);
    expect(uploadOneDriveFile).toHaveBeenCalledWith(
      'tok',
      'drive-1',
      '/BACKUP_QL MED/NFE/XML/2026_09',
      `${ACCESS_KEY}-nfe.xml`,
      expect.any(Buffer),
      'application/xml',
    );
  });

  it('quando há PDF, também envia Danfe_NF#########.pdf', async () => {
    const pdf = Buffer.from('%PDF-1.4');
    const result = await uploadIssuedNfeToOneDrive({
      companyId: 'co1',
      accessKey: ACCESS_KEY,
      invoiceNumber: INVOICE_NUMBER,
      issueDate: '2026-09-08',
      xml: XML_STUB,
      pdf,
    });

    expect(result.pdfPath).toBe('/BACKUP_QL MED/NFE/Danfes/2026_09/Danfe_NF000065254.pdf');
    expect(ensureOneDriveFolder).toHaveBeenCalledWith(
      'tok',
      'drive-1',
      '/BACKUP_QL MED/NFE/Danfes/2026_09',
    );
    expect(uploadOneDriveFile).toHaveBeenNthCalledWith(
      2,
      'tok',
      'drive-1',
      '/BACKUP_QL MED/NFE/Danfes/2026_09',
      'Danfe_NF000065254.pdf',
      pdf,
      'application/pdf',
    );
  });

  it('falha de conexão OneDrive resolve null sem lançar', async () => {
    resolveAccountOneDrive.mockRejectedValueOnce(new Error('Conexão OneDrive não encontrada'));
    await expect(uploadIssuedNfeToOneDrive({
      companyId: 'co1',
      accessKey: ACCESS_KEY,
      invoiceNumber: INVOICE_NUMBER,
      issueDate: '2026-09-08',
      xml: XML_STUB,
    })).resolves.toEqual({ xmlPath: null, pdfPath: null });
    expect(uploadOneDriveFile).not.toHaveBeenCalled();
  });

  it('accessKey inválida não chama Graph', async () => {
    await expect(uploadIssuedNfeToOneDrive({
      companyId: 'co1',
      accessKey: '../../etc/passwd',
      invoiceNumber: INVOICE_NUMBER,
      issueDate: '2026-09-08',
      xml: XML_STUB,
    })).resolves.toEqual({ xmlPath: null, pdfPath: null });
    expect(resolveAccountOneDrive).not.toHaveBeenCalled();
    expect(ensureOneDriveFolder).not.toHaveBeenCalled();
    expect(uploadOneDriveFile).not.toHaveBeenCalled();
  });
});
