import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLogger } from '@/lib/logger';
import {
  MAX_OCR_PAGES,
  MAX_PDF_BYTES,
  createOcrDeadline,
  looksLikePdf,
  parsePdfInfoPages,
  type OcrDeadline,
} from '@/lib/pdf/ocr-limits';

const log = createLogger('cassems/extract-pdf');

function run(
  command: string,
  args: string[],
  deadline: OcrDeadline,
): { stdout: string; status: number | null } {
  const timeout = deadline.remainingMs();
  if (timeout <= 0) return { stdout: '', status: null };
  const result = spawnSync(command, args, { encoding: 'utf8', timeout });
  return { stdout: result.stdout || '', status: result.status };
}

function commandExists(command: string): boolean {
  const result = spawnSync('which', [command], { encoding: 'utf8' });
  return result.status === 0;
}

/**
 * 1) pdftotext. 2) se vazio e os binários existirem, pdftoppm + tesseract -l por.
 *
 * Tetos (auditoria FILE-003), todos aplicados ANTES do custo:
 * bytes e magic `%PDF` antes de escrever em disco; contagem de páginas via
 * `pdfinfo` antes de rasterizar — acima de `MAX_OCR_PAGES` o OCR é abandonado
 * de vez e fica só o `pdftotext`; orçamento de parede compartilhado por todos
 * os spawns, em vez de 60s por processo.
 */
export async function extractPdfText(pdf: Buffer): Promise<string> {
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
  const dir = mkdtempSync(join(tmpdir(), 'cassems-ocr-'));
  const pdfPath = join(dir, 'oficio.pdf');
  writeFileSync(pdfPath, pdf);

  try {
    if (commandExists('pdftotext')) {
      const text = run('pdftotext', ['-layout', '-enc', 'UTF-8', pdfPath, '-'], deadline);
      if (text.stdout.trim()) return text.stdout;
    }

    if (!commandExists('pdftoppm') || !commandExists('tesseract')) {
      log.warn('ocr_binaries_missing');
      return '';
    }

    // Documento gigante: rasterizar/OCRar é o ataque. Abandona o OCR.
    if (commandExists('pdfinfo')) {
      const info = run('pdfinfo', [pdfPath], deadline);
      const pageCount = parsePdfInfoPages(info.stdout);
      if (pageCount !== null && pageCount > MAX_OCR_PAGES) {
        log.warn({ pages: pageCount, limit: MAX_OCR_PAGES }, 'pdf_too_many_pages_ocr_skipped');
        return '';
      }
    }

    const prefix = join(dir, 'page');
    // `-l N` corta na origem: sem isto um PDF de 500 páginas vira 500 PNGs.
    run('pdftoppm', ['-png', '-r', '200', '-f', '1', '-l', String(MAX_OCR_PAGES), pdfPath, prefix], deadline);
    const pages = readdirSync(dir)
      .filter((name) => name.startsWith('page') && name.endsWith('.png'))
      .sort()
      .slice(0, MAX_OCR_PAGES);
    if (pages.length === 0) return '';
    let ocr = '';
    for (const page of pages) {
      if (deadline.expired()) {
        log.warn({ pages: pages.length }, 'ocr_budget_exhausted');
        break;
      }
      readFileSync(join(dir, page));
      const result = run('tesseract', [join(dir, page), 'stdout', '-l', 'por', '--oem', '1'], deadline);
      ocr += `\n${result.stdout}`;
    }
    return ocr.trim();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
