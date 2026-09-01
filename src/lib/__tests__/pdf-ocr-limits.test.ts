import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_OCR_PAGES, MAX_PDF_BYTES, createOcrDeadline } from '@/lib/pdf/ocr-limits';

/**
 * FILE-003: o PDF vem de anexo de e-mail. Antes, qualquer tamanho era escrito
 * em disco, TODAS as páginas viravam PNG e cada uma ganhava um `tesseract` com
 * timeout próprio de 60s — o custo total não tinha teto nenhum.
 */

const mocks = vi.hoisted(() => ({
  spawnSync: vi.fn(),
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(() => Buffer.alloc(0)),
  readdirSync: vi.fn(() => [] as string[]),
  mkdtempSync: vi.fn(() => '/tmp/ocr-test'),
  rmSync: vi.fn(),
  warn: vi.fn(),
}));

vi.mock('node:child_process', () => ({ spawnSync: mocks.spawnSync }));
vi.mock('node:fs', () => ({
  spawnSync: mocks.spawnSync,
  writeFileSync: mocks.writeFileSync,
  readFileSync: mocks.readFileSync,
  readdirSync: mocks.readdirSync,
  mkdtempSync: mocks.mkdtempSync,
  rmSync: mocks.rmSync,
}));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ warn: mocks.warn, error: vi.fn(), info: vi.fn() }),
}));

import { extractPdfText as extractImpcg } from '@/lib/impcg/extract-pdf-text';
import { extractPdfText as extractCassems } from '@/lib/cassems/extract-pdf-text';

/** Todos os binários existem; pdftotext devolve vazio para forçar o caminho OCR. */
function ocrPathAvailable(pageCount: number) {
  mocks.spawnSync.mockImplementation((cmd: string) => {
    if (cmd === 'which') return { status: 0, stdout: '/usr/bin/x' };
    return { status: 0, stdout: '' };
  });
  mocks.readdirSync.mockReturnValue(
    Array.from({ length: pageCount }, (_, i) => `page-${i + 1}.png`),
  );
}

function tesseractCalls() {
  return mocks.spawnSync.mock.calls.filter((c) => c[0] === 'tesseract');
}

function pdftoppmCall() {
  return mocks.spawnSync.mock.calls.find((c) => c[0] === 'pdftoppm');
}

describe.each([
  ['impcg', extractImpcg],
  ['cassems', extractCassems],
])('extractPdfText %s (FILE-003)', (_name, extract) => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mkdtempSync.mockReturnValue('/tmp/ocr-test');
    mocks.readFileSync.mockReturnValue(Buffer.alloc(0));
  });

  it('recusa PDF acima do cap SEM escrever em disco nem spawnar processo', async () => {
    const huge = Buffer.alloc(MAX_PDF_BYTES + 1);

    await expect(extract(huge)).resolves.toBe('');

    expect(mocks.writeFileSync).not.toHaveBeenCalled();
    expect(mocks.spawnSync).not.toHaveBeenCalled();
    expect(mocks.mkdtempSync).not.toHaveBeenCalled();
    expect(mocks.warn).toHaveBeenCalledWith(
      expect.objectContaining({ limit: MAX_PDF_BYTES }),
      'pdf_too_large',
    );
  });

  it('limita a rasterização na origem: pdftoppm recebe -l MAX_OCR_PAGES', async () => {
    ocrPathAvailable(3);

    await extract(Buffer.from('%PDF-1.4 fake'));

    const call = pdftoppmCall();
    expect(call).toBeDefined();
    const args = call![1] as string[];
    expect(args).toContain('-l');
    expect(args[args.indexOf('-l') + 1]).toBe(String(MAX_OCR_PAGES));
  });

  it('não roda mais que MAX_OCR_PAGES tesseract mesmo com 500 PNGs no diretório', async () => {
    // PDF com contagem de páginas absurda: pdftoppm ignorado, 500 arquivos.
    ocrPathAvailable(500);

    await extract(Buffer.from('%PDF-1.4 fake'));

    // impcg pode fazer 1 fallback extra na primeira página; o teto continua valendo.
    expect(tesseractCalls().length).toBeLessThanOrEqual(MAX_OCR_PAGES + 1);
  });

  it('passa timeout em TODO spawn de OCR (orçamento, não só 60s por processo)', async () => {
    ocrPathAvailable(5);

    await extract(Buffer.from('%PDF-1.4 fake'));

    for (const call of mocks.spawnSync.mock.calls) {
      if (call[0] === 'which') continue;
      expect((call[2] as { timeout?: number }).timeout).toBeGreaterThan(0);
    }
  });

  it('passa -l por ao tesseract (idioma explícito)', async () => {
    ocrPathAvailable(2);

    await extract(Buffer.from('%PDF-1.4 fake'));

    for (const call of tesseractCalls()) {
      const args = call[1] as string[];
      expect(args).toContain('-l');
      expect(args[args.indexOf('-l') + 1]).toBe('por');
    }
  });

  it('PDF vazio continua devolvendo vazio sem tocar em disco', async () => {
    await expect(extract(Buffer.alloc(0))).resolves.toBe('');
    expect(mocks.mkdtempSync).not.toHaveBeenCalled();
  });
});

describe('createOcrDeadline (FILE-003 orçamento total)', () => {
  it('devolve tempo restante decrescente e expira', () => {
    const deadline = createOcrDeadline(50);
    expect(deadline.remainingMs()).toBeGreaterThan(0);
    expect(deadline.expired()).toBe(false);
  });

  it('orçamento zerado não autoriza mais nenhum spawn', () => {
    const deadline = createOcrDeadline(0);
    expect(deadline.remainingMs()).toBe(0);
    expect(deadline.expired()).toBe(true);
  });

  it('nunca autoriza um spawn maior que o teto por processo', () => {
    const deadline = createOcrDeadline(10 * 60_000);
    expect(deadline.remainingMs()).toBeLessThanOrEqual(60_000);
  });
});
