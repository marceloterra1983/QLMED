import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLogger } from '@/lib/logger';

const log = createLogger('impcg/extract-pdf');

function run(command: string, args: string[]): { stdout: string; status: number | null } {
  const result = spawnSync(command, args, { encoding: 'utf8', timeout: 60_000 });
  return { stdout: result.stdout || '', status: result.status };
}

function commandExists(command: string): boolean {
  const result = spawnSync('which', [command], { encoding: 'utf8' });
  return result.status === 0;
}

/**
 * 1) pdftotext. 2) se vazio e os binários existirem, pdftoppm + tesseract -l por.
 * Sem tesseract/poppler (CI enxuto) devolve string vazia — o parser testa texto injetado.
 */
export async function extractPdfText(pdf: Buffer): Promise<string> {
  if (pdf.length === 0) return '';

  const dir = mkdtempSync(join(tmpdir(), 'impcg-ocr-'));
  const pdfPath = join(dir, 'oficio.pdf');
  writeFileSync(pdfPath, pdf);

  try {
    if (commandExists('pdftotext')) {
      const text = run('pdftotext', ['-layout', '-enc', 'UTF-8', pdfPath, '-']);
      if (text.stdout.trim()) return text.stdout;
    }

    if (!commandExists('pdftoppm') || !commandExists('tesseract')) {
      log.warn('ocr_binaries_missing');
      return '';
    }

    const prefix = join(dir, 'page');
    // 300 dpi + PSM 6: a data do cabeçalho some em 200 dpi / layout automático.
    run('pdftoppm', ['-png', '-r', '300', pdfPath, prefix]);
    const pages = readdirSync(dir)
      .filter((name) => name.startsWith('page') && name.endsWith('.png'))
      .sort();
    if (pages.length === 0) return '';

    const chunks: string[] = [];
    for (const page of pages) {
      const pagePath = join(dir, page);
      readFileSync(pagePath);
      const primary = run('tesseract', [pagePath, 'stdout', '-l', 'por', '--oem', '1', '--psm', '6']);
      let text = primary.stdout.trim();
      const firstPage = page.endsWith('-1.png');
      if (
        firstPage
        && !(/data\s*[:\-]/i.test(text) || /\d{1,2}\s*[/\-.]\s*\d{1,2}\s*[/\-.]\s*\d{4}/.test(text))
      ) {
        const fallback = run('tesseract', [pagePath, 'stdout', '-l', 'por', '--oem', '1', '--psm', '4']);
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
