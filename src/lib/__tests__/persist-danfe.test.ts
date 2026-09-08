import { beforeEach, describe, expect, it, vi } from 'vitest';

const { saveIssuedPdfToFile, renderHtmlToPdf } = vi.hoisted(() => ({
  saveIssuedPdfToFile: vi.fn(async () => '/tmp/Danfe_NF000065248.pdf'),
  renderHtmlToPdf: vi.fn(async () => Buffer.from('%PDF-1.4')),
}));

vi.mock('@/lib/xml-file-store', () => ({ saveIssuedPdfToFile }));
vi.mock('@/lib/pdf/render', () => ({ renderHtmlToPdf }));

import { persistAuthorizedDanfePdf } from '@/lib/nfe-emission/persist-danfe';

describe('persistAuthorizedDanfePdf', () => {
  beforeEach(() => {
    saveIssuedPdfToFile.mockClear();
    renderHtmlToPdf.mockClear();
    renderHtmlToPdf.mockResolvedValue(Buffer.from('%PDF-1.4'));
  });

  it('grava PDF a partir do XML autorizado', async () => {
    const xml = '<nfeProc><NFe><infNFe><ide><nNF>65248</nNF><serie>2</serie></ide></infNFe></NFe></nfeProc>';
    const path = await persistAuthorizedDanfePdf({
      companyId: 'co1',
      invoiceNumber: '65248',
      xml,
      issueDate: '2026-09-08',
    });
    expect(path).toBe('/tmp/Danfe_NF000065248.pdf');
    expect(renderHtmlToPdf).toHaveBeenCalledOnce();
    expect(saveIssuedPdfToFile).toHaveBeenCalledWith('co1', '65248', expect.any(Buffer), '2026-09-08');
  });

  it('não lança se o render falhar', async () => {
    renderHtmlToPdf.mockRejectedValueOnce(new Error('no chrome'));
    await expect(persistAuthorizedDanfePdf({
      companyId: 'co1',
      invoiceNumber: '1',
      xml: '<nfeProc><NFe><infNFe><ide><nNF>1</nNF></ide></infNFe></NFe></nfeProc>',
      issueDate: null,
    })).resolves.toBeNull();
  });

  it('re-renderiza com data-total quando o primeiro PDF tem 2 páginas', async () => {
    const twoPagePdf = Buffer.from(
      '%PDF-1.4\n1 0 obj\n<< /Type /Pages /Count 2 /Kids [2 0 R 3 0 R] >>\nendobj\n',
      'latin1',
    );
    renderHtmlToPdf
      .mockResolvedValueOnce(twoPagePdf)
      .mockResolvedValueOnce(Buffer.from('%PDF-1.4'));

    const path = await persistAuthorizedDanfePdf({
      companyId: 'co1',
      invoiceNumber: '65210',
      xml: '<nfeProc><NFe><infNFe><ide><nNF>65210</nNF><serie>2</serie></ide></infNFe></NFe></nfeProc>',
      issueDate: '2026-09-08',
    });

    expect(path).toBe('/tmp/Danfe_NF000065248.pdf');
    expect(renderHtmlToPdf).toHaveBeenCalledTimes(2);
    const secondHtml = String(renderHtmlToPdf.mock.calls.at(1)?.at(0) ?? '');
    expect(secondHtml).toContain('data-total="2"');
    expect(saveIssuedPdfToFile).toHaveBeenCalledOnce();
  });
});
