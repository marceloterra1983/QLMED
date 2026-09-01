import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const launch = vi.hoisted(() => vi.fn());
vi.mock('puppeteer-core', () => ({ default: { launch } }));

import { renderHtmlToPdf } from '@/lib/pdf/render';

const originalPath = process.env.PUPPETEER_EXECUTABLE_PATH;

function fakeBrowser(pdfBytes = new Uint8Array([1, 2, 3])) {
  const close = vi.fn().mockResolvedValue(undefined);
  const pdf = vi.fn().mockResolvedValue(pdfBytes);
  const setContent = vi.fn().mockResolvedValue(undefined);
  const setJavaScriptEnabled = vi.fn().mockResolvedValue(undefined);
  const setRequestInterception = vi.fn().mockResolvedValue(undefined);
  const handlers: Record<string, (arg: unknown) => void> = {};
  const on = vi.fn((event: string, handler: (arg: unknown) => void) => {
    handlers[event] = handler;
  });
  launch.mockResolvedValue({
    newPage: vi.fn().mockResolvedValue({
      setContent,
      pdf,
      setJavaScriptEnabled,
      setRequestInterception,
      on,
    }),
    close,
  });
  return { close, pdf, setContent, setJavaScriptEnabled, setRequestInterception, handlers };
}

/** Simula um request que a página tentou fazer e devolve o veredito. */
function requestVerdict(handlers: Record<string, (arg: unknown) => void>, url: string) {
  const request = { url: () => url, continue: vi.fn(), abort: vi.fn() };
  handlers.request?.(request);
  return request;
}

beforeEach(() => { launch.mockReset(); });
afterEach(() => {
  if (originalPath === undefined) delete process.env.PUPPETEER_EXECUTABLE_PATH;
  else process.env.PUPPETEER_EXECUTABLE_PATH = originalPath;
});

describe('renderHtmlToPdf', () => {
  it('falha com mensagem acionável quando PUPPETEER_EXECUTABLE_PATH não está setado', async () => {
    delete process.env.PUPPETEER_EXECUTABLE_PATH;
    await expect(renderHtmlToPdf('<p>x</p>', {})).rejects.toThrow(/PUPPETEER_EXECUTABLE_PATH/);
    // puppeteer-core ignora a env var, então nem pode chegar a abrir o browser
    expect(launch).not.toHaveBeenCalled();
  });

  it('passa executablePath explícito para o launch', async () => {
    process.env.PUPPETEER_EXECUTABLE_PATH = '/usr/bin/chromium-browser';
    fakeBrowser();
    await renderHtmlToPdf('<p>x</p>', { format: 'A4' });
    expect(launch).toHaveBeenCalledWith(
      expect.objectContaining({ executablePath: '/usr/bin/chromium-browser' }),
    );
  });

  it('fecha o browser mesmo quando a geração falha', async () => {
    process.env.PUPPETEER_EXECUTABLE_PATH = '/usr/bin/chromium-browser';
    const { close, pdf } = fakeBrowser();
    pdf.mockRejectedValue(new Error('boom'));
    await expect(renderHtmlToPdf('<p>x</p>', {})).rejects.toThrow('boom');
    expect(close).toHaveBeenCalledOnce();
  });

  // FILE-005: o HTML carrega dados de nota (nome de fornecedor vem do XML de
  // terceiro). Com JS e rede ligados, isso era SSRF/exfiltração na renderização.
  describe('endurecimento do Chromium (FILE-005)', () => {
    beforeEach(() => { process.env.PUPPETEER_EXECUTABLE_PATH = '/usr/bin/chromium-browser'; });

    it('desliga o JavaScript antes de injetar o HTML', async () => {
      const { setJavaScriptEnabled } = fakeBrowser();
      await renderHtmlToPdf('<p>x</p>', {});
      expect(setJavaScriptEnabled).toHaveBeenCalledWith(false);
    });

    it('aborta request de rede: <img src="http://interno"> não sai da máquina', async () => {
      const { handlers, setRequestInterception } = fakeBrowser();
      await renderHtmlToPdf('<img src="http://169.254.169.254/latest/meta-data/">', {});

      expect(setRequestInterception).toHaveBeenCalledWith(true);

      const ssrf = requestVerdict(handlers, 'http://169.254.169.254/latest/meta-data/');
      expect(ssrf.abort).toHaveBeenCalled();
      expect(ssrf.continue).not.toHaveBeenCalled();

      const exfil = requestVerdict(handlers, 'https://evil.example/?leak=nota');
      expect(exfil.abort).toHaveBeenCalled();

      const local = requestVerdict(handlers, 'file:///etc/passwd');
      expect(local.abort).toHaveBeenCalled();

      // O caso exato do brief.
      const loopback = requestVerdict(handlers, 'http://127.0.0.1/');
      expect(loopback.abort).toHaveBeenCalled();
      expect(loopback.continue).not.toHaveBeenCalled();
    });

    // REAUD-B-13: nenhum gerador emite `data:` nem `<img>`; a permissão só
    // servia para reabrir os decodificadores de imagem sem sandbox.
    it('aborta `data:` — não há uso legítimo e é o que reabre os decodificadores de imagem', async () => {
      const { handlers } = fakeBrowser();
      await renderHtmlToPdf('<p>x</p>', {});

      const inline = requestVerdict(handlers, 'data:image/png;base64,iVBOR');
      expect(inline.abort).toHaveBeenCalled();
      expect(inline.continue).not.toHaveBeenCalled();

      const svg = requestVerdict(handlers, 'data:image/svg+xml;utf8,<svg/>');
      expect(svg.abort).toHaveBeenCalled();
    });

    it('só `about:` passa — é a página em branco do setContent', async () => {
      const { handlers } = fakeBrowser();
      await renderHtmlToPdf('<p>x</p>', {});

      const blank = requestVerdict(handlers, 'about:blank');
      expect(blank.continue).toHaveBeenCalled();
      expect(blank.abort).not.toHaveBeenCalled();
    });

    it('dá timeout explícito ao setContent e ao pdf()', async () => {
      const { setContent, pdf } = fakeBrowser();
      await renderHtmlToPdf('<p>x</p>', { format: 'A4' });

      expect(setContent).toHaveBeenCalledWith('<p>x</p>', expect.objectContaining({
        timeout: expect.any(Number),
      }));
      expect(pdf).toHaveBeenCalledWith(expect.objectContaining({
        timeout: expect.any(Number),
        format: 'A4',
      }));
    });

    it('opções do chamador ainda vencem o default', async () => {
      const { pdf } = fakeBrowser();
      await renderHtmlToPdf('<p>x</p>', { timeout: 1234 });
      expect(pdf).toHaveBeenCalledWith(expect.objectContaining({ timeout: 1234 }));
    });
  });
});
