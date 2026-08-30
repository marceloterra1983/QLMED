import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLogger } from '@/lib/logger';

const log = createLogger('cassems/extract-pdf');

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
 */
export async function extractPdfText(pdf: Buffer): Promise<string> {
  if (pdf.length === 0) return '';

  const dir = mkdtempSync(join(tmpdir(), 'cassems-ocr-'));
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
    run('pdftoppm', ['-png', '-r', '200', pdfPath, prefix]);
    const pages = readdirSync(dir).filter((name) => name.startsWith('page') && name.endsWith('.png')).sort();
    if (pages.length === 0) return '';
    let ocr = '';
    for (const page of pages) {
      readFileSync(join(dir, page));
      const result = run('tesseract', [join(dir, page), 'stdout', '-l', 'por', '--oem', '1']);
      ocr += `\n${result.stdout}`;
    }
    return ocr.trim();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
