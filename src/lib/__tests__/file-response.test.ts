import { describe, expect, it } from 'vitest';
import {
  createBufferFileResponse,
  createStreamFileResponse,
  inlineDisposition,
} from '@/lib/file-response';

describe('file-response', () => {
  it('inlineDisposition sanitiza caracteres perigosos e codifica UTF-8', () => {
    const header = inlineDisposition('Ofício Médico - 2026/09 "urgente"\r\n.pdf');
    expect(header).toContain('inline; filename=');
    expect(header).not.toContain('\r');
    expect(header).not.toContain('\n');
    expect(header).not.toContain('"urgente"');
    expect(header).toContain("filename*=UTF-8''");
  });

  it('inlineDisposition usa fallback para nomes vazios ou puramente inválidos', () => {
    const header = inlineDisposition('///');
    expect(header).toContain('filename="arquivo.pdf"');
  });

  it('createStreamFileResponse monta cabeçalhos HTTP de streaming com segurança', () => {
    const stream = new ReadableStream();
    const response = createStreamFileResponse(stream, {
      fileName: 'relatorio.pdf',
      contentLength: 1024,
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('application/pdf');
    expect(response.headers.get('Content-Length')).toBe('1024');
    expect(response.headers.get('Cache-Control')).toBe('private, max-age=300');
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(response.headers.get('Content-Disposition')).toContain('inline; filename="relatorio.pdf"');
  });

  it('createBufferFileResponse deriva Content-Length automaticamente do buffer', () => {
    const buffer = Buffer.from('conteudo teste pdf');
    const response = createBufferFileResponse(buffer, {
      fileName: 'documento.pdf',
      dispositionType: 'attachment',
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Length')).toBe(String(buffer.length));
    expect(response.headers.get('Content-Disposition')).toContain('attachment; filename="documento.pdf"');
  });
});
