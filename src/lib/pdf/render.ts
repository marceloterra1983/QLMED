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
/** Teto de parede para carregar o HTML e para gerar o PDF (auditoria FILE-005). */
export const PDF_RENDER_TIMEOUT_MS = 30_000;

export async function renderHtmlToPdf(html: string, options: PDFOptions): Promise<Buffer<ArrayBuffer>> {
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: resolveExecutablePath(),
    // `--no-sandbox` continua porque o container Alpine roda sem user
    // namespaces; o que o torna perigoso — script e rede na página — é
    // desligado abaixo, por página.
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--disable-extensions',
      '--disable-background-networking',
    ],
    timeout: PDF_RENDER_TIMEOUT_MS,
  });
  try {
    const page = await browser.newPage();

    // O HTML é autocontido (CSS inline, sem imagem ou script remoto): nada
    // legítimo precisa de JS nem de rede. Com os dois desligados, um nome de
    // fornecedor vindo do XML deixa de poder buscar URL interna (SSRF) ou
    // exfiltrar o conteúdo da nota.
    await page.setJavaScriptEnabled(false);
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      const url = request.url();
      if (url.startsWith('data:') || url.startsWith('about:')) {
        void request.continue();
        return;
      }
      void request.abort();
    });

    await page.setContent(html, { waitUntil: 'load', timeout: PDF_RENDER_TIMEOUT_MS });
    return Buffer.from(await page.pdf({ timeout: PDF_RENDER_TIMEOUT_MS, ...options }));
  } finally {
    await browser.close();
  }
}
