import { describe, expect, it } from 'vitest';
import {
  foldedFileKey,
  sanitizeCartaFileName,
  scanCartaMailboxes,
  type CartaMailPort,
} from '@/lib/documentos/carta-mail';
import { isCartaComercializacaoCandidate } from '@/lib/documentos/classify';

describe('isCartaComercializacaoCandidate', () => {
  it('aceita carta de comercialização pelo nome/assunto', () => {
    expect(
      isCartaComercializacaoCandidate('Carta Comercialização TECHIMPORT.pdf', 'Carta TECHIMPORT'),
    ).toBe(true);
    expect(
      isCartaComercializacaoCandidate('anexo.pdf', 'Carta de autorização de comercialização'),
    ).toBe(true);
  });

  it('ignora DANFE / NF-e / boleto', () => {
    expect(isCartaComercializacaoCandidate('DANFE 123.pdf', 'Carta comercialização')).toBe(false);
    expect(isCartaComercializacaoCandidate('NFe-123.pdf', 'nota')).toBe(false);
    expect(isCartaComercializacaoCandidate('boleto.pdf', 'boleto')).toBe(false);
  });

  it('rejeita NF DOC / nota fiscal mesmo com assunto de carta', () => {
    expect(
      isCartaComercializacaoCandidate('NF DOC MED 81.472.pdf', 'Carta de comercialização'),
    ).toBe(false);
    expect(
      isCartaComercializacaoCandidate(
        'anexo.pdf',
        'Carta comercialização',
        'DANFE Documento Auxiliar da Nota Fiscal Eletronica chave de acesso 3522',
      ),
    ).toBe(false);
    expect(
      isCartaComercializacaoCandidate('pedido.pdf', 'Carta', 'nota fiscal de devolucao'),
    ).toBe(false);
  });
});

describe('scanCartaMailboxes', () => {
  it('importa PDF novo, salta DANFE e carta já existente', async () => {
    const uploads: string[] = [];
    const port: CartaMailPort = {
      listMessages: async () => [
        {
          graphMessageId: 'm1',
          internetMessageId: '<m1@x>',
          subject: 'Carta de comercialização TECHIMPORT',
          receivedAt: new Date('2026-09-01T12:00:00.000Z'),
          hasAttachments: true,
        },
        {
          graphMessageId: 'm2',
          internetMessageId: '<m2@x>',
          subject: 'DANFE',
          receivedAt: new Date('2026-09-01T12:00:00.000Z'),
          hasAttachments: true,
        },
        {
          graphMessageId: 'm3',
          internetMessageId: '<m3@x>',
          subject: 'Carta comercialização OSTEOMED',
          receivedAt: new Date('2026-09-01T12:00:00.000Z'),
          hasAttachments: true,
        },
      ],
      listPdfs: async (_mailbox, graphMessageId) => {
        if (graphMessageId === 'm1') {
          return [{ name: 'Carta Comercialização TECHIMPORT.pdf', content: Buffer.from('%PDF-1.4 a') }];
        }
        if (graphMessageId === 'm2') {
          return [{ name: 'DANFE 123.pdf', content: Buffer.from('%PDF-1.4 b') }];
        }
        return [{ name: 'Carta Comercialização OSTEOMED.pdf', content: Buffer.from('%PDF-1.4 c') }];
      },
      listExistingNames: async () => ['Carta Comercialização OSTEOMED.pdf'],
      upload: async (fileName) => {
        uploads.push(fileName);
        return { id: `id-${uploads.length}`, name: fileName };
      },
    };

    const result = await scanCartaMailboxes('co1', { port });
    expect(result.imported).toBe(1);
    expect(uploads).toEqual(['Carta Comercialização TECHIMPORT.pdf']);
    expect(result.skipped).toBeGreaterThanOrEqual(2);
    expect(foldedFileKey('Carta Comercialização OSTEOMED.pdf')).toBe(
      foldedFileKey(sanitizeCartaFileName('Carta Comercialização OSTEOMED.pdf')),
    );
  });

  it('falha de uma caixa não aborta as outras', async () => {
    let calls = 0;
    const port: CartaMailPort = {
      listMessages: async () => {
        calls += 1;
        if (calls === 1) throw new Error('mailbox down');
        return [];
      },
      listPdfs: async () => [],
      listExistingNames: async () => [],
      upload: async () => ({ id: 'x', name: 'x.pdf' }),
    };
    const result = await scanCartaMailboxes('co1', { port });
    expect(result.failed).toBe(1);
    expect(calls).toBe(4);
  });
});
