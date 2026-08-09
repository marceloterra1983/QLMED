import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const launch = vi.hoisted(() => vi.fn());
vi.mock('puppeteer-core', () => ({ default: { launch } }));

import { renderHtmlToPdf } from '@/lib/pdf/render';

const originalPath = process.env.PUPPETEER_EXECUTABLE_PATH;

function fakeBrowser(pdfBytes = new Uint8Array([1, 2, 3])) {
  const close = vi.fn().mockResolvedValue(undefined);
  const pdf = vi.fn().mockResolvedValue(pdfBytes);
  launch.mockResolvedValue({
    newPage: vi.fn().mockResolvedValue({ setContent: vi.fn().mockResolvedValue(undefined), pdf }),
    close,
  });
  return { close, pdf };
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
});
