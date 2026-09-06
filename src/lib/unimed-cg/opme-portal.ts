import puppeteer, { type Browser, type Page } from 'puppeteer-core';
import { createLogger } from '@/lib/logger';
import { UNIMED_CG_OPME_HOSTS } from './constants';

const log = createLogger('unimed-cg/opme-portal');

const LOGIN_URL = 'https://unimedcg.opmes.com.br/gestao/www/login.php';
const PRINCIPAL_PATH = '/gestao/www/principal.php';
const RECAPTCHA_SITEKEY = '6LekH7crAAAAAN3H7j7d5CF3f0nyTiducmTD_muh';
const BENEFICIARIO_RE =
  /Benefici[aá]rio[\s\S]{0,400}?([A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-ZÁÉÍÓÚÂÊÔÃÕÇ ]{5,80})\s+(\d{4}-\d{4}-\d{6}-\d{2}-\d)/;

export type OpmePortalCredentials = {
  username: string;
  password: string;
};

/**
 * Credenciais só via ENV (nunca hardcoded):
 * - UNIMED_CG_OPME_USERNAME
 * - UNIMED_CG_OPME_PASSWORD
 */
export function getOpmePortalCredentialsFromEnv(): OpmePortalCredentials | null {
  const username = (process.env.UNIMED_CG_OPME_USERNAME ?? '').trim();
  const password = process.env.UNIMED_CG_OPME_PASSWORD ?? '';
  if (!username || !password) return null;
  return { username, password };
}

function resolveExecutablePath(): string {
  const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
  if (!executablePath) {
    throw new Error(
      'PUPPETEER_EXECUTABLE_PATH não configurado para o portal OPME Unimed CG',
    );
  }
  return executablePath;
}

function assertOpmeUrl(url: string): URL {
  const parsed = new URL(url);
  if (!UNIMED_CG_OPME_HOSTS.includes(parsed.hostname as (typeof UNIMED_CG_OPME_HOSTS)[number])) {
    throw new Error(`host OPME fora da allowlist: ${parsed.hostname}`);
  }
  return parsed;
}

async function dismissFecharPopup(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const el = [...document.querySelectorAll('button, a, input[type=button], .btn')]
      .find((n) => (n.textContent || (n as HTMLInputElement).value || '').trim() === 'Fechar');
    if (!el) return false;
    (el as HTMLElement).click();
    return true;
  });
}

async function waitForRecaptchaToken(page: Page, timeoutMs = 60_000): Promise<string> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const token = await page.evaluate(() => {
      const el = document.querySelector('#g-recaptcha-response') as HTMLTextAreaElement | null;
      return el?.value?.trim() || '';
    });
    if (token.length > 20) return token;
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error('reCAPTCHA token não disponível a tempo');
}

async function refreshRecaptchaToken(page: Page): Promise<void> {
  await page.evaluate(async (sitekey) => {
    const g = (window as unknown as {
      grecaptcha?: {
        execute: (key: string, opts: { action: string }) => Promise<string>;
      };
    }).grecaptcha;
    if (!g?.execute) throw new Error('grecaptcha.execute indisponível');
    const token = await g.execute(sitekey, { action: 'login' });
    const el = document.querySelector('#g-recaptcha-response') as HTMLTextAreaElement | null;
    if (el) el.value = token;
    const bot = document.querySelector('#bot_flag') as HTMLInputElement | null;
    if (bot) bot.value = '0';
  }, RECAPTCHA_SITEKEY);
}

async function loginOpme(page: Page, credentials: OpmePortalCredentials): Promise<void> {
  assertOpmeUrl(LOGIN_URL);
  await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForSelector('#form-first-name', { timeout: 30_000 });
  await page.waitForSelector('#form-last-name', { timeout: 30_000 });

  await waitForRecaptchaToken(page);

  await page.click('#form-first-name', { count: 3 });
  await page.type('#form-first-name', credentials.username, { delay: 25 });
  await page.click('#form-last-name', { count: 3 });
  await page.type('#form-last-name', credentials.password, { delay: 25 });

  await refreshRecaptchaToken(page);

  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60_000 }).catch(() => null),
    page.evaluate(() => {
      const form = document.querySelector('form[name=autentica], form.registration-form, form') as HTMLFormElement | null;
      if (!form) throw new Error('form de login não encontrado');
      form.submit();
    }),
  ]);

  const url = page.url();
  if (!url.includes('principal.php') && !url.includes('/gestao/www/')) {
    throw new Error(`login OPME não chegou em principal (url=${url.split('?')[0]})`);
  }
  if (url.includes('login.php')) {
    throw new Error('login OPME rejeitado (ainda em login.php)');
  }

  // Popup EMS Painel
  await new Promise((r) => setTimeout(r, 800));
  const closed = await dismissFecharPopup(page);
  if (closed) {
    log.info('unimed_cg_opme_popup_fechar');
    await new Promise((r) => setTimeout(r, 400));
  }
}

function extractBeneficiarioFromText(text: string): string | null {
  const match = BENEFICIARIO_RE.exec(text);
  const name = match?.[1]?.replace(/\s+/g, ' ').trim();
  return name || null;
}

async function scrapeBeneficiario(page: Page, processId: string): Promise<string | null> {
  const safeId = processId.replace(/[^\d]/g, '');
  if (!safeId) return null;

  const directUrl = `https://unimedcg.opmes.com.br/gestao/www/visualiza-processo.php?proc_id=${safeId}`;
  assertOpmeUrl(directUrl);

  // Prefer search box when available on principal
  const hasSearch = await page.$('input[name=id]');
  if (hasSearch) {
    await page.click('input[name=id]', { count: 3 });
    await page.type('input[name=id]', safeId, { delay: 20 });
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 45_000 }).catch(() => null),
      page.keyboard.press('Enter'),
    ]);
    await new Promise((r) => setTimeout(r, 600));
    await dismissFecharPopup(page);

    const onVisualiza = page.url().includes('visualiza-processo');
    if (!onVisualiza) {
      const clicked = await page.evaluate((id) => {
        const link = [...document.querySelectorAll('a')].find((a) => {
          const href = a.getAttribute('href') || '';
          return href.includes(`proc_id=${id}`) || new RegExp(`proc_id=${id}(?:&|$)`).test(href);
        });
        if (!link) return false;
        (link as HTMLAnchorElement).click();
        return true;
      }, safeId);
      if (clicked) {
        await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 45_000 }).catch(() => null);
      } else {
        await page.goto(directUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 });
      }
    }
  } else {
    await page.goto(directUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  }

  await new Promise((r) => setTimeout(r, 500));
  await dismissFecharPopup(page);

  const text = await page.evaluate(() => document.body?.innerText || '');
  return extractBeneficiarioFromText(text);
}

export type OpmePortalSession = {
  fetchBeneficiario(processId: string): Promise<string | null>;
  close(): Promise<void>;
};

/**
 * Sessão reutilizável num tick de ingest: login uma vez, vários processIds.
 * Host allowlist: apenas unimedcg.opmes.com.br.
 */
export async function openOpmePortalSession(
  credentials: OpmePortalCredentials | null = getOpmePortalCredentialsFromEnv(),
): Promise<OpmePortalSession | null> {
  if (!credentials) {
    log.info('unimed_cg_opme_session_skipped_no_credentials');
    return null;
  }

  let browser: Browser | null = null;
  let page: Page | null = null;
  const cache = new Map<string, string | null>();

  try {
    browser = await puppeteer.launch({
      headless: true,
      executablePath: resolveExecutablePath(),
      ignoreDefaultArgs: ['--enable-automation'],
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
      ],
    });

    page = await browser.newPage();
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });
    });
    page.setDefaultTimeout(60_000);

    await loginOpme(page, credentials);
    log.info({ host: UNIMED_CG_OPME_HOSTS[0] }, 'unimed_cg_opme_session_ready');

    const sessionPage = page;
    const sessionBrowser = browser;

    return {
      async fetchBeneficiario(processId: string) {
        const safeId = processId.replace(/[^\d]/g, '');
        if (!safeId) return null;
        if (cache.has(safeId)) return cache.get(safeId) ?? null;
        try {
          // Volta ao principal para reusar a busca quando possível
          if (!sessionPage.url().includes('principal.php')) {
            await sessionPage.goto(`https://unimedcg.opmes.com.br${PRINCIPAL_PATH}`, {
              waitUntil: 'domcontentloaded',
              timeout: 45_000,
            }).catch(() => null);
            await dismissFecharPopup(sessionPage);
          }
          const name = await scrapeBeneficiario(sessionPage, safeId);
          cache.set(safeId, name);
          if (name) {
            log.info({ processId: safeId }, 'unimed_cg_opme_beneficiario_ok');
          } else {
            log.info({ processId: safeId }, 'unimed_cg_opme_beneficiario_miss');
          }
          return name;
        } catch (error) {
          log.warn(
            {
              processId: safeId,
              err: error instanceof Error ? error.message.slice(0, 200) : 'scrape',
            },
            'unimed_cg_opme_beneficiario_failed',
          );
          cache.set(safeId, null);
          return null;
        }
      },
      async close() {
        await sessionBrowser.close().catch(() => undefined);
      },
    };
  } catch (error) {
    await browser?.close().catch(() => undefined);
    log.warn(
      { err: error instanceof Error ? error.message.slice(0, 200) : 'session' },
      'unimed_cg_opme_session_failed',
    );
    return null;
  }
}

export type OpmeBeneficiarioResult = {
  processId: string;
  patientName: string | null;
};

/** One-shot helper (abre sessão, busca um ID, fecha). Preferir openOpmePortalSession no ingest. */
export async function fetchOpmeBeneficiario(
  processId: string,
  credentials: OpmePortalCredentials | null = getOpmePortalCredentialsFromEnv(),
): Promise<OpmeBeneficiarioResult> {
  const safeId = processId.replace(/[^\d]/g, '') || processId;
  const session = await openOpmePortalSession(credentials);
  if (!session) return { processId: safeId, patientName: null };
  try {
    const patientName = await session.fetchBeneficiario(safeId);
    return { processId: safeId, patientName };
  } finally {
    await session.close();
  }
}

/** Exposto para testes unitários do regex (sem browser). */
export function parseBeneficiarioFromPortalText(text: string): string | null {
  return extractBeneficiarioFromText(text);
}
