import puppeteer, { type PDFOptions } from 'puppeteer-core';

const PDF_RENDER_TIMEOUT_MS = 30_000;

/**
 * O pacote `puppeteer` completo baixa um Chromium próprio e resolve
 * PUPPETEER_EXECUTABLE_PATH sozinho (em getConfiguration.ts). O
 * `puppeteer-core` não faz nenhum dos dois: não baixa nada e ignora as
 * variáveis PUPPETEER_*. Por isso o caminho é resolvido aqui, num lugar só,
 * para as duas rotas que geram PDF.
 */
function resolveExecutablePath(): string {
  const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
  if (!executablePath) {
    throw new Error(
      'PUPPETEER_EXECUTABLE_PATH não configurado: aponte para o binário do Chrome/Chromium. '
      + 'A imagem Docker já define /usr/bin/chromium-browser; em dev, use o Chrome instalado na máquina.',
    );
  }
  return executablePath;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('PDF rendering timed out')), timeoutMs);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error: unknown) => { clearTimeout(timer); reject(error); },
    );
  });
}

/**
 * Renderiza HTML autocontido (CSS inline, sem imagens ou scripts remotos) em
 * PDF. `setContent` espera o evento `load` por padrão, que é o suficiente aqui.
 */
// O parâmetro de Buffer importa: `Buffer<ArrayBufferLike>` não é aceito como
// BodyInit de uma Response (SharedArrayBuffer não vale), `Buffer<ArrayBuffer>`
// é — e é justamente o que `Buffer.from` devolve.
export async function renderHtmlToPdf(html: string, options: PDFOptions): Promise<Buffer<ArrayBuffer>> {
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: resolveExecutablePath(),
    protocolTimeout: PDF_RENDER_TIMEOUT_MS,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load', timeout: PDF_RENDER_TIMEOUT_MS });
    const pdf = await withTimeout(page.pdf(options), PDF_RENDER_TIMEOUT_MS);
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
