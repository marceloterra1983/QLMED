import puppeteer, { type PDFOptions } from 'puppeteer-core';
import { assertAllowedHost } from '@/lib/http-allowlist';
import { PDF_RENDER_TIMEOUT_MS } from '@/lib/pdf/render';
import { UNIMED_CG_OPME_HOSTS } from '@/lib/unimed-cg/constants';

export { UNIMED_CG_OPME_HOSTS };

/**
 * Valida URL contra allowlist sem lançar Puppeteer — usado em testes unitários
 * e como pré-checagem antes do goto.
 */
export function validateUrlForRender(
  url: string,
  allowedHosts: readonly string[] = UNIMED_CG_OPME_HOSTS,
): URL {
  return assertAllowedHost(url, allowedHosts);
}

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
 * Renderiza uma URL allowlisted em PDF via page.goto.
 * Rede só para about: e hosts da allowlist; JS ligado (página OPME pode precisar).
 */
export async function renderUrlToPdf(
  url: string,
  allowedHosts: readonly string[] = UNIMED_CG_OPME_HOSTS,
  options: PDFOptions = {},
): Promise<Buffer<ArrayBuffer>> {
  const allowed = validateUrlForRender(url, allowedHosts);
  const hostSet = new Set(allowedHosts.map((h) => h.toLowerCase()));

  const browser = await puppeteer.launch({
    headless: true,
    executablePath: resolveExecutablePath(),
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
    await page.setJavaScriptEnabled(true);
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      const reqUrl = request.url();
      if (reqUrl.startsWith('about:')) {
        void request.continue();
        return;
      }
      try {
        const host = new URL(reqUrl).hostname.toLowerCase();
        if (hostSet.has(host)) {
          void request.continue();
          return;
        }
      } catch {
        // fall through to abort
      }
      void request.abort();
    });

    await page.goto(allowed.toString(), {
      waitUntil: 'networkidle0',
      timeout: PDF_RENDER_TIMEOUT_MS,
    });
    return Buffer.from(await page.pdf({ timeout: PDF_RENDER_TIMEOUT_MS, format: 'A4', ...options }));
  } finally {
    await browser.close();
  }
}
