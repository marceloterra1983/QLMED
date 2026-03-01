const { chromium, devices } = require('playwright-core');

(async () => {
  const device = devices['Galaxy S9+'];
  const browser = await chromium.launch({ 
    headless: true,
    executablePath: '/home/marce/.cache/ms-playwright/mcp-chrome-8ea65b0/chrome-linux/chrome'
  });
  const context = await browser.newContext({ ...device });
  const page = await context.newPage();

  // Login
  await page.goto('http://localhost:3001/login');
  await page.fill('input[type="email"]', 'marcelo@qlmed.com.br');
  await page.fill('input[type="password"]', 'qlmed2026');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/visaogeral', { timeout: 10000 });
  console.log('Logged in!');

  // Contas a Pagar
  await page.goto('http://localhost:3001/financeiro/contas-pagar');
  await page.waitForTimeout(5000);
  await page.screenshot({ path: '/tmp/android-contas-pagar.png' });
  console.log('Screenshot: contas-pagar');

  // Contas a Receber
  await page.goto('http://localhost:3001/financeiro/contas-receber');
  await page.waitForTimeout(5000);
  await page.screenshot({ path: '/tmp/android-contas-receber.png' });
  console.log('Screenshot: contas-receber');

  // Visão Geral
  await page.goto('http://localhost:3001/visaogeral');
  await page.waitForTimeout(5000);
  await page.screenshot({ path: '/tmp/android-visaogeral.png' });
  console.log('Screenshot: visaogeral');

  // NF-e Recebidas
  await page.goto('http://localhost:3001/fiscal/invoices');
  await page.waitForTimeout(5000);
  await page.screenshot({ path: '/tmp/android-invoices.png' });
  console.log('Screenshot: invoices');

  await browser.close();
  console.log('Done!');
})();
