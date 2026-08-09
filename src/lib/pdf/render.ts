import puppeteer, { type PDFOptions } from 'puppeteer-core';

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
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    return Buffer.from(await page.pdf(options));
  } finally {
    await browser.close();
  }
}
