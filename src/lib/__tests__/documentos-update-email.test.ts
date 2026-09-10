import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  buildDocumentosSummaryHtml,
  buildDocumentosSummaryText,
  categoryLabelForSummary,
  type DocumentosSummaryRow,
} from '@/lib/documentos/share-email';
import { listingToSummaryRows } from '@/lib/documentos/update-email';
import type { DocumentosListing } from '@/lib/documentos/list';

const sendMail = vi.hoisted(() =>
  vi.fn(async (_mail: Record<string, unknown>) => ({ messageId: 'mid-1' })),
);

vi.mock('@/lib/prisma', () => ({
  default: {
    companyDocument: {
      findFirst: vi.fn(async () => ({
        id: 'doc1',
        kind: 'cnd_estadual_mt',
        fileName: 'CERTIDÃO ESTADUAL DO MATO GROSSO 08.11.26.pdf',
        oneDriveItemId: 'od1',
        validUntil: new Date('2026-11-08T00:00:00.000Z'),
      })),
      findMany: vi.fn(async () => []),
    },
    companyDocumentIngestState: {
      findUnique: vi.fn(async () => null),
    },
  },
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

vi.mock('@/lib/documentos/onedrive-port', () => ({
  createDocumentosFolderPort: vi.fn(),
}));

const sampleRows: DocumentosSummaryRow[] = [
  {
    categoryLabel: 'Certidões',
    label: 'CND Estadual MT',
    fileName: 'CERTIDÃO ESTADUAL DO MATO GROSSO 08.11.26.pdf',
    validUntil: '2026-11-08',
    statusLabel: 'Vigente',
  },
  {
    categoryLabel: 'Sanitária',
    label: 'Alvará',
    fileName: null,
    validUntil: null,
    statusLabel: 'Ausente',
  },
];

describe('FR-046 summary table builders', () => {
  it('buildDocumentosSummaryHtml tem colunas e linhas escapadas', () => {
    const html = buildDocumentosSummaryHtml([
      {
        categoryLabel: 'Certidões',
        label: 'A <B>',
        fileName: 'x.pdf',
        validUntil: '2026-11-08',
        statusLabel: 'Vigente',
      },
    ]);
    expect(html).toContain('<th>Categoria</th>');
    expect(html).toContain('<th>Status</th>');
    expect(html).toContain('08/11/2026');
    expect(html).toContain('A &lt;B&gt;');
    expect(html).not.toContain('A <B>');
  });

  it('buildDocumentosSummaryText lista documentos', () => {
    const text = buildDocumentosSummaryText(sampleRows);
    expect(text).toContain('Resumo dos documentos QLMED');
    expect(text).toContain('CND Estadual MT');
    expect(text).toContain('08/11/2026');
    expect(text).toContain('Ausente');
  });

  it('categoryLabelForSummary cobre categorias conhecidas', () => {
    expect(categoryLabelForSummary('certidao')).toBe('Certidões');
    expect(categoryLabelForSummary('balanco')).toBe('Balanços');
  });
});

describe('listingToSummaryRows', () => {
  it('achata a listagem em linhas de resumo', () => {
    const listing = {
      certidoes: [
        {
          id: '1',
          kind: 'cnd_estadual_mt',
          category: 'certidao',
          label: 'CND MT',
          fileName: 'a.pdf',
          validUntil: '2026-11-08',
          emitidoEm: null,
          daysRemaining: 59,
          status: { key: 'ok', label: 'Vigente' },
          validUntilSource: 'manual',
          expira: true,
          emissaoUrl: null,
          emissaoAria: null,
          webUrl: null,
          automacao: null,
        },
      ],
      sanitaria: [],
      cartas: [],
      societario: [],
      basicos: [],
      balancos: [],
      ingest: { lastSuccessAt: null, lastError: null, lastErrorAt: null },
      shareRecipients: [],
      whatsappRecipients: [],
    } as unknown as DocumentosListing;

    const rows = listingToSummaryRows(listing);
    expect(rows).toEqual([
      {
        categoryLabel: 'Certidões',
        label: 'CND MT',
        fileName: 'a.pdf',
        validUntil: '2026-11-08',
        statusLabel: 'Vigente',
      },
    ]);
  });

  it('achata balanços agrupados por ano', () => {
    const listing = {
      certidoes: [],
      sanitaria: [],
      cartas: [],
      societario: [],
      basicos: [],
      balancos: [
        {
          year: 2025,
          documents: [
            {
              id: 'b1',
              kind: 'balanco_anual',
              category: 'balanco',
              label: 'Balanço 2025',
              fileName: 'BALANCO 2025.pdf',
              validUntil: null,
              emitidoEm: null,
              daysRemaining: null,
              status: { key: 'ok', label: 'Vigente' },
              validUntilSource: null,
              expira: false,
              emissaoUrl: null,
              emissaoAria: null,
              webUrl: null,
              automacao: null,
            },
          ],
        },
      ],
      ingest: { lastSuccessAt: null, lastError: null, lastErrorAt: null },
      shareRecipients: [],
      whatsappRecipients: [],
    } as unknown as DocumentosListing;

    expect(listingToSummaryRows(listing)).toEqual([
      {
        categoryLabel: 'Balanços',
        label: 'Balanço 2025',
        fileName: 'BALANCO 2025.pdf',
        validUntil: null,
        statusLabel: 'Vigente',
      },
    ]);
  });
});

describe('notifyDocumentUpdateByEmail', () => {
  beforeEach(() => {
    sendMail.mockClear();
  });

  it('envia de adm@qlmed.com.br com anexo e tabela HTML', async () => {
    const { notifyDocumentUpdateByEmail } = await import('@/lib/documentos/update-email');
    const listing = {
      certidoes: [
        {
          id: 'doc1',
          kind: 'cnd_estadual_mt',
          category: 'certidao',
          label: 'CND Estadual MT',
          fileName: 'CERTIDÃO ESTADUAL DO MATO GROSSO 08.11.26.pdf',
          validUntil: '2026-11-08',
          emitidoEm: null,
          daysRemaining: 59,
          status: { key: 'ok', label: 'Vigente' },
          validUntilSource: 'manual',
          expira: true,
          emissaoUrl: null,
          emissaoAria: null,
          webUrl: null,
          automacao: null,
        },
      ],
      sanitaria: [],
      cartas: [],
      societario: [],
      basicos: [],
      balancos: [],
      ingest: { lastSuccessAt: null, lastError: null, lastErrorAt: null },
      shareRecipients: [],
      whatsappRecipients: [],
    } as unknown as DocumentosListing;

    const pdf = Buffer.from('%PDF-1.7');
    const result = await notifyDocumentUpdateByEmail({
      companyId: 'co1',
      documentId: 'doc1',
      pdf,
      listing,
      mailTransport: { sendMail },
    });

    expect(result?.sent).toEqual([
      'marcelo@qlmed.com.br',
      'daniele@qlmed.com.br',
      'flavio@qlmed.com.br',
      'joseroberto@qlmed.com.br',
    ]);
    expect(sendMail).toHaveBeenCalledTimes(1);
    const mail = sendMail.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
    expect(mail).toBeDefined();
    expect(String(mail?.from)).toContain('adm@qlmed.com.br');
    expect(String(mail?.html)).toContain('Resumo dos documentos QLMED');
    expect(String(mail?.html)).toContain('<th>Categoria</th>');
    expect(String(mail?.html)).toContain('CND Estadual MT');
    expect(String(mail?.text)).toContain('Resumo dos documentos QLMED');
    const attachments = mail?.attachments as Array<{ filename: string; content: Buffer }> | undefined;
    expect(attachments?.[0]?.filename).toContain('MATO GROSSO');
    expect(attachments?.[0]?.content).toBe(pdf);
  });
});
