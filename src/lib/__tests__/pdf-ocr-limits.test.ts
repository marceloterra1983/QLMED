import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_OCR_PAGES,
  MAX_PDF_BYTES,
  createOcrDeadline,
  looksLikePdf,
  parsePdfInfoPages,
} from '@/lib/pdf/ocr-limits';

/** Fixture: cabeçalho %PDF real, conteúdo sintético. */
const FAKE_PDF = Buffer.from('%PDF-1.4\n% fixture sintetica\n');

/**
 * FILE-003: o PDF vem de anexo de e-mail. Antes, qualquer tamanho era escrito
 * em disco, TODAS as páginas viravam PNG e cada uma ganhava um `tesseract` com
 * timeout próprio de 60s — o custo total não tinha teto nenhum.
 */

const mocks = vi.hoisted(() => ({
  /**
   * `execFile` é consumido via `promisify`, então o que o código realmente chama
   * é o handler do símbolo `nodejs.util.promisify.custom`. É nele que gravamos
   * as chamadas — `execFile` cru nunca é invocado.
   */
  run: vi.fn(async (_cmd: string, _args: string[], _opts: unknown) => ({ stdout: '' })),
  /** Chamar qualquer destas volta a travar o servidor: falha alto. */
  syncSpawn: vi.fn(() => {
    throw new Error('spawn síncrono bloqueia o event loop do Next');
  }),
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(() => Buffer.alloc(0)),
  readdirSync: vi.fn(() => [] as string[]),
  mkdtempSync: vi.fn(() => '/tmp/ocr-test'),
  rmSync: vi.fn(),
  warn: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  execFile: Object.assign(vi.fn(), {
    [Symbol.for('nodejs.util.promisify.custom')]: mocks.run,
  }),
  spawnSync: mocks.syncSpawn,
  execFileSync: mocks.syncSpawn,
  execSync: mocks.syncSpawn,
}));
vi.mock('node:fs', () => ({
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
function ocrPathAvailable(pageCount: number, reportedPages = pageCount) {
  mocks.run.mockImplementation(async (cmd: string) => {
    if (cmd === 'which') return { stdout: '/usr/bin/x' };
    if (cmd === 'pdfinfo') return { stdout: `Pages:          ${reportedPages}\n` };
    return { stdout: '' };
  });
  mocks.readdirSync.mockReturnValue(
    Array.from({ length: pageCount }, (_, i) => `page-${i + 1}.png`),
  );
}

function tesseractCalls() {
  return mocks.run.mock.calls.filter((c) => c[0] === 'tesseract');
}

function pdftoppmCall() {
  return mocks.run.mock.calls.find((c) => c[0] === 'pdftoppm');
}

describe.each([
  ['impcg', extractImpcg],
  ['cassems', extractCassems],
])('extractPdfText %s (FILE-003)', (_name, extract) => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mkdtempSync.mockReturnValue('/tmp/ocr-test');
    mocks.readFileSync.mockReturnValue(Buffer.alloc(0));
    mocks.run.mockResolvedValue({ stdout: '' });
  });

  it('recusa PDF acima do cap SEM escrever em disco nem spawnar processo', async () => {
    const huge = Buffer.alloc(MAX_PDF_BYTES + 1);

    await expect(extract(huge)).resolves.toBe('');

    expect(mocks.writeFileSync).not.toHaveBeenCalled();
    expect(mocks.run).not.toHaveBeenCalled();
    expect(mocks.mkdtempSync).not.toHaveBeenCalled();
    expect(mocks.warn).toHaveBeenCalledWith(
      expect.objectContaining({ limit: MAX_PDF_BYTES }),
      'pdf_too_large',
    );
  });

  it('limita a rasterização na origem: pdftoppm recebe -l MAX_OCR_PAGES', async () => {
    ocrPathAvailable(3);

    await extract(FAKE_PDF);

    const call = pdftoppmCall();
    expect(call).toBeDefined();
    const args = call![1] as string[];
    expect(args).toContain('-l');
    expect(args[args.indexOf('-l') + 1]).toBe(String(MAX_OCR_PAGES));
  });

  it('não roda mais que MAX_OCR_PAGES tesseract mesmo com 500 PNGs no diretório', async () => {
    // PDF com contagem de páginas absurda: pdftoppm ignorado, 500 arquivos.
    ocrPathAvailable(500);

    await extract(FAKE_PDF);

    // impcg pode fazer 1 fallback extra na primeira página; o teto continua valendo.
    expect(tesseractCalls().length).toBeLessThanOrEqual(MAX_OCR_PAGES + 1);
  });

  it('passa timeout em TODO spawn de OCR (orçamento, não só 60s por processo)', async () => {
    ocrPathAvailable(5);

    await extract(FAKE_PDF);

    for (const call of mocks.run.mock.calls) {
      if (call[0] === 'which') continue;
      expect((call[2] as { timeout?: number }).timeout).toBeGreaterThan(0);
    }
  });

  it('passa -l por ao tesseract (idioma explícito)', async () => {
    ocrPathAvailable(2);

    await extract(FAKE_PDF);

    for (const call of tesseractCalls()) {
      const args = call[1] as string[];
      expect(args).toContain('-l');
      expect(args[args.indexOf('-l') + 1]).toBe('por');
    }
  });

  it('PDF de 9999 páginas aborta SEM chamar tesseract nenhuma vez', async () => {
    ocrPathAvailable(9999);

    await expect(extract(FAKE_PDF)).resolves.toBe('');

    expect(tesseractCalls()).toHaveLength(0);
    expect(pdftoppmCall()).toBeUndefined();
    expect(mocks.warn).toHaveBeenCalledWith(
      expect.objectContaining({ pages: 9999 }),
      'pdf_too_many_pages_ocr_skipped',
    );
  });

  it('recusa arquivo sem magic %PDF antes de escrever em disco', async () => {
    ocrPathAvailable(1);

    await expect(extract(Buffer.from('PK\x03\x04 isto e um zip'))).resolves.toBe('');

    expect(mocks.writeFileSync).not.toHaveBeenCalled();
    expect(mocks.run).not.toHaveBeenCalled();
  });

  it('PDF vazio continua devolvendo vazio sem tocar em disco', async () => {
    await expect(extract(Buffer.alloc(0))).resolves.toBe('');
    expect(mocks.mkdtempSync).not.toHaveBeenCalled();
  });
});

describe('magic %PDF e contagem de páginas (FILE-003)', () => {
  it('só aceita buffer que começa com %PDF-', () => {
    expect(looksLikePdf(Buffer.from('%PDF-1.7 ...'))).toBe(true);
    expect(looksLikePdf(Buffer.from('PK\x03\x04'))).toBe(false);
    expect(looksLikePdf(Buffer.from('<html>'))).toBe(false);
    expect(looksLikePdf(Buffer.alloc(2))).toBe(false);
  });

  it('lê a contagem de páginas da saída do pdfinfo', () => {
    expect(parsePdfInfoPages('Title: x\nPages:          42\nEncrypted: no')).toBe(42);
    expect(parsePdfInfoPages('sem contagem')).toBeNull();
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

/**
 * Regressão do 502 intermitente: `spawnSync` parava o event loop do Next por
 * todo o OCR e o servidor inteiro deixava de responder durante uma importação.
 * Guarda determinística: qualquer API síncrona de spawn explode o teste.
 */
describe.each([
  ['impcg', extractImpcg],
  ['cassems', extractCassems],
])('extractPdfText %s não usa spawn síncrono', (_name, extract) => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mkdtempSync.mockReturnValue('/tmp/ocr-test');
    mocks.readFileSync.mockReturnValue(Buffer.alloc(0));
  });

  it('percorre o caminho de OCR inteiro sem chamar spawnSync/execSync', async () => {
    ocrPathAvailable(2);

    await extract(FAKE_PDF);

    expect(mocks.run).toHaveBeenCalled();
    expect(mocks.syncSpawn).not.toHaveBeenCalled();
  });
});
