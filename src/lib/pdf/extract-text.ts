/**
 * extract-text.ts — Motor unificado de extração de texto de PDFs via pdftotext / tesseract OCR.
 *
 * Consolida o ciclo de vida de OCR, orçamentos de tempo (OcrDeadline),
 * limites de páginas/bytes e limpeza de arquivos temporários para as rotinas
 * de ingestão de operadoras de saúde (IMPCG, CASSEMS, Unimed-CG).
 */

import { execFile } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { createLogger } from '@/lib/logger';
import {
  MAX_OCR_PAGES,
  MAX_PDF_BYTES,
  createOcrDeadline,
  looksLikePdf,
  parsePdfInfoPages,
  type OcrDeadline,
} from '@/lib/pdf/ocr-limits';

const log = createLogger('pdf/extract-text');

const execFileAsync = promisify(execFile);

async function run(
  command: string,
  args: string[],
  deadline: OcrDeadline,
): Promise<{ stdout: string; status: number | null }> {
  const timeout = deadline.remainingMs();
  if (timeout <= 0) return { stdout: '', status: null };
  try {
    const { stdout } = await execFileAsync(command, args, {
      encoding: 'utf8',
      timeout,
      maxBuffer: 32 * 1024 * 1024,
    });
    return { stdout: stdout || '', status: 0 };
  } catch (err) {
    const e = err as { stdout?: string; code?: number | string };
    return { stdout: e.stdout || '', status: typeof e.code === 'number' ? e.code : null };
  }
}

async function commandExists(command: string, deadline: OcrDeadline): Promise<boolean> {
  const result = await run('which', [command], deadline);
  return result.status === 0;
}

export interface ExtractPdfTextOptions {
  prefix?: string;
  firstPageFallbackPsm4?: boolean;
}

/**
 * 1) pdftotext (rápido). 2) se vazio e binários presentes: pdftoppm + tesseract -l por.
 * Limites aplicados antes do custo (magic bytes, tamanho, contagem de páginas).
 */
export async function extractPdfText(
  pdf: Buffer,
  options: ExtractPdfTextOptions = {},
): Promise<string> {
  if (pdf.length === 0) return '';
  if (pdf.length > MAX_PDF_BYTES) {
    log.warn({ bytes: pdf.length, limit: MAX_PDF_BYTES }, 'pdf_too_large');
    return '';
  }
  if (!looksLikePdf(pdf)) {
    log.warn({ bytes: pdf.length }, 'pdf_magic_missing');
    return '';
  }

  const deadline = createOcrDeadline();
  const dir = mkdtempSync(join(tmpdir(), `${options.prefix || 'pdf-ocr'}-`));
  const pdfPath = join(dir, 'document.pdf');
  writeFileSync(pdfPath, pdf);

  try {
    if (await commandExists('pdftotext', deadline)) {
      const text = await run('pdftotext', ['-layout', '-enc', 'UTF-8', pdfPath, '-'], deadline);
      if (text.stdout.trim()) return text.stdout;
    }

    if (!(await commandExists('pdftoppm', deadline)) || !(await commandExists('tesseract', deadline))) {
      log.warn('ocr_binaries_missing');
      return '';
    }

    if (await commandExists('pdfinfo', deadline)) {
      const info = await run('pdfinfo', [pdfPath], deadline);
      const pageCount = parsePdfInfoPages(info.stdout);
      if (pageCount !== null && pageCount > MAX_OCR_PAGES) {
        log.warn({ pages: pageCount, limit: MAX_OCR_PAGES }, 'pdf_too_many_pages_ocr_skipped');
        return '';
      }
    }

    const pagePrefix = join(dir, 'page');
    await run(
      'pdftoppm',
      ['-png', '-r', '300', '-f', '1', '-l', String(MAX_OCR_PAGES), pdfPath, pagePrefix],
      deadline,
    );
    const pages = readdirSync(dir)
      .filter((name) => name.startsWith('page') && name.endsWith('.png'))
      .sort()
      .slice(0, MAX_OCR_PAGES);
    if (pages.length === 0) return '';

    const chunks: string[] = [];
    for (const page of pages) {
      if (deadline.expired()) {
        log.warn({ pages: pages.length }, 'ocr_budget_exhausted');
        break;
      }
      const pagePath = join(dir, page);
      readFileSync(pagePath);
      const primary = await run(
        'tesseract',
        [pagePath, 'stdout', '-l', 'por', '--oem', '1', '--psm', '6'],
        deadline,
      );
      let text = primary.stdout.trim();
      const firstPage = page.endsWith('-1.png');
      if (
        options.firstPageFallbackPsm4 &&
        firstPage &&
        !(/data\s*[:\-]/i.test(text) || /\d{1,2}\s*[/\-.]\s*\d{1,2}\s*[/\-.]\s*\d{4}/.test(text))
      ) {
        const fallback = await run(
          'tesseract',
          [pagePath, 'stdout', '-l', 'por', '--oem', '1', '--psm', '4'],
          deadline,
        );
        const extra = fallback.stdout.trim();
        text = extra && extra.length > text.length ? `${text}\n${extra}` : text || extra;
      }
      if (text) chunks.push(text);
    }
    return chunks.join('\n');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
