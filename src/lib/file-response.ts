/**
 * file-response.ts — Módulo profundo para streaming e download de arquivos via NextResponse.
 *
 * Consolida a sanitização RFC 5987 / RFC 6266 de Content-Disposition (inline e attachment),
 * tipos MIME, cabeçalhos de segurança (X-Content-Type-Options) e Cache-Control.
 *
 * Substitui as 7 cópias idênticas de inlineDisposition e montagem manual de cabeçalhos
 * espalhadas pelas rotas de download de documentos e ofícios.
 */

import { NextResponse } from 'next/server';

export interface FileResponseOptions {
  fileName: string;
  contentType?: string;
  contentLength?: number | string | null;
  cacheControl?: string;
  dispositionType?: 'inline' | 'attachment';
}

/**
 * Monta o header Content-Disposition com sanitização segura de caracteres de controle
 * e codificação UTF-8 compatível com navegadores modernos (RFC 5987).
 */
export function inlineDisposition(fileName: string, fallbackDefault: string = 'arquivo.pdf'): string {
  const fallback = fileName.replace(/[\\/\r\n"]/g, '_').trim() || fallbackDefault;
  return `inline; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

/**
 * Cria uma resposta HTTP 200 transmitindo um ReadableStream com cabeçalhos padronizados.
 */
export function createStreamFileResponse(
  stream: ReadableStream<unknown> | BodyInit,
  options: FileResponseOptions,
): NextResponse {
  const contentType = options.contentType ?? 'application/pdf';
  const cacheControl = options.cacheControl ?? 'private, max-age=300';
  const disposition = options.dispositionType === 'attachment'
    ? `attachment; filename="${options.fileName.replace(/[\\/\r\n"]/g, '_').trim() || 'arquivo.pdf'}"; filename*=UTF-8''${encodeURIComponent(options.fileName)}`
    : inlineDisposition(options.fileName);

  const headers: Record<string, string> = {
    'Content-Type': contentType,
    'Content-Disposition': disposition,
    'Cache-Control': cacheControl,
    'X-Content-Type-Options': 'nosniff',
  };

  if (options.contentLength != null) {
    headers['Content-Length'] = String(options.contentLength);
  }

  return new NextResponse(stream, {
    status: 200,
    headers,
  });
}

/**
 * Cria uma resposta HTTP 200 transmitindo um Buffer de arquivo em memória.
 */
export function createBufferFileResponse(
  content: Buffer,
  options: FileResponseOptions,
): NextResponse {
  return createStreamFileResponse(content as unknown as BodyInit, {
    ...options,
    contentLength: options.contentLength ?? content.length,
  });
}
