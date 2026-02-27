import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, unauthorizedResponse } from '@/lib/auth';
import puppeteer from 'puppeteer';
import nodemailer from 'nodemailer';

/* ── Helpers ── */

function fmtCurrency(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtCurrencyShort(v: number): string {
  if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `R$ ${(v / 1_000).toFixed(0)}k`;
  return fmtCurrency(v);
}

function fmtNum(v: number): string {
  return v.toLocaleString('pt-BR');
}

function esc(text: string | null | undefined): string {
  if (!text) return '';
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* ── Types ── */

interface Product {
  code: string;
  description: string;
  shortName: string | null;
  purchasedQty: number;
  purchasedValue: number;
  soldQty: number;
  soldValue: number;
  netQty: number;
  avgPurchasePrice: number | null;
  avgSalePrice: number | null;
}

interface CustomerYear {
  customerName: string;
  shortName: string;
  totalQty: number;
  totalValue: number;
  lastUnitPrice: number | null;
  byYear: Record<string, { qty: number; value: number }>;
}

interface ReportData {
  summary: { totalProducts: number };
  products: Product[];
  customerYearlySales: { years: number[]; customers: CustomerYear[] };
  meta: { invoicesScanned: number; issuedInvoicesScanned: number };
}

/* ── Build HTML ── */

function buildHtml(data: ReportData): string {
  const products = data.products;
  const purchasedQty = products.reduce((s, p) => s + p.purchasedQty, 0);
  const purchasedValue = products.reduce((s, p) => s + p.purchasedValue, 0);
  const soldQty = products.reduce((s, p) => s + p.soldQty, 0);
  const soldValue = products.reduce((s, p) => s + p.soldValue, 0);
  const netQty = products.reduce((s, p) => s + p.netQty, 0);
  const stockValue = products.reduce((s, p) => {
    if (p.netQty <= 0 || p.purchasedQty <= 0) return s;
    return s + p.netQty * (p.purchasedValue / p.purchasedQty);
  }, 0);
  const avgPurchasePrice = purchasedQty > 0 ? purchasedValue / purchasedQty : 0;
  const avgSalePrice = soldQty > 0 ? soldValue / soldQty : 0;
  const grossProfit = soldValue - (soldQty > 0 && purchasedQty > 0 ? soldQty * (purchasedValue / purchasedQty) : 0);

  const kpis = [
    { label: 'Qtd Comprada', value: fmtNum(purchasedQty), color: '#10b981' },
    { label: 'Valor Comprado', value: fmtCurrencyShort(purchasedValue), color: '#3b82f6' },
    { label: 'Preço Méd. Compra', value: fmtCurrency(avgPurchasePrice), color: '#6366f1' },
    { label: 'Qtd Vendida', value: fmtNum(soldQty), color: '#a855f7' },
    { label: 'Valor Vendido', value: fmtCurrencyShort(soldValue), color: '#f59e0b' },
    { label: 'Preço Méd. Venda', value: fmtCurrency(avgSalePrice), color: '#f97316' },
    { label: 'Saldo Estoque', value: fmtNum(netQty), color: netQty > 0 ? '#10b981' : netQty < 0 ? '#ef4444' : '#64748b' },
    { label: 'Valor Estoque', value: fmtCurrencyShort(stockValue), color: '#06b6d4' },
    { label: 'Lucro Bruto', value: fmtCurrencyShort(grossProfit), color: grossProfit >= 0 ? '#22c55e' : '#ef4444' },
  ];

  const today = new Date().toLocaleDateString('pt-BR');
  const years = data.customerYearlySales.years;
  const customers = data.customerYearlySales.customers;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11px; color: #1e293b; padding: 16px 20px; }
  h1 { font-size: 18px; font-weight: 700; margin-bottom: 2px; }
  .subtitle { font-size: 10px; color: #64748b; margin-bottom: 12px; }
  .kpi-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin-bottom: 14px; }
  .kpi { border: 1px solid #e2e8f0; border-radius: 6px; padding: 6px 10px; }
  .kpi-label { font-size: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #94a3b8; }
  .kpi-value { font-size: 16px; font-weight: 700; }
  table { width: 100%; border-collapse: collapse; font-size: 10px; }
  th { background: #f8fafc; font-size: 8px; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b; font-weight: 700; padding: 4px 6px; border-bottom: 1px solid #e2e8f0; }
  td { padding: 3px 6px; border-bottom: 1px solid #f1f5f9; }
  .section-title { font-size: 12px; font-weight: 700; margin: 12px 0 6px; }
  .text-right { text-align: right; }
  .mono { font-family: 'Cascadia Code', 'Consolas', monospace; }
  .total-row { background: #f8fafc; font-weight: 700; border-top: 2px solid #cbd5e1; }
  .positive { color: #10b981; }
  .negative { color: #ef4444; }
  .dim { color: #94a3b8; }
  .small { font-size: 8px; color: #94a3b8; }
</style>
</head>
<body>
<h1>Válvulas Mecânicas Corcym</h1>
<div class="subtitle">Relatório consolidado de compras e vendas — gerado em ${today}</div>

<div class="kpi-grid">
${kpis.map(k => `
  <div class="kpi">
    <div class="kpi-label">${k.label}</div>
    <div class="kpi-value" style="color:${k.color}">${k.value}</div>
  </div>
`).join('')}
</div>

<div class="section-title">Vendas por Cliente / Ano</div>
<table>
  <thead>
    <tr>
      <th style="text-align:left">Cliente</th>
      ${years.map(y => `<th class="text-right">${y}</th>`).join('')}
      <th class="text-right">Total</th>
      <th class="text-right">Últ. Preço</th>
    </tr>
  </thead>
  <tbody>
    ${customers.map(c => `
    <tr>
      <td>${esc(c.shortName)}</td>
      ${years.map(y => {
        const e = c.byYear[String(y)];
        return `<td class="text-right mono">${e && e.qty > 0 ? `${fmtNum(e.qty)}<br><span class="small">${fmtCurrency(e.value)}</span>` : '<span class="dim">—</span>'}</td>`;
      }).join('')}
      <td class="text-right mono" style="font-weight:700">${fmtNum(c.totalQty)}<br><span class="small">${fmtCurrency(c.totalValue)}</span></td>
      <td class="text-right mono">${c.lastUnitPrice != null ? fmtCurrency(c.lastUnitPrice) : '—'}</td>
    </tr>
    `).join('')}
    <tr class="total-row">
      <td>TOTAL</td>
      ${years.map(y => {
        const yk = String(y);
        const yq = customers.reduce((s, c) => s + (c.byYear[yk]?.qty || 0), 0);
        const yv = customers.reduce((s, c) => s + (c.byYear[yk]?.value || 0), 0);
        return `<td class="text-right mono">${fmtNum(yq)}<br><span class="small">${fmtCurrency(yv)}</span></td>`;
      }).join('')}
      <td class="text-right mono">${fmtNum(customers.reduce((s, c) => s + c.totalQty, 0))}<br><span class="small">${fmtCurrency(customers.reduce((s, c) => s + c.totalValue, 0))}</span></td>
      <td></td>
    </tr>
  </tbody>
</table>

<div class="section-title">Detalhamento por Produto (${products.length})</div>
<table>
  <thead>
    <tr>
      <th style="text-align:left">Cód</th>
      <th style="text-align:left">Descrição</th>
      <th class="text-right">Qt Compra</th>
      <th class="text-right">Vl Compra</th>
      <th class="text-right">Qt Venda</th>
      <th class="text-right">Vl Venda</th>
      <th class="text-right">Saldo</th>
      <th class="text-right">PM Compra</th>
      <th class="text-right">PM Venda</th>
    </tr>
  </thead>
  <tbody>
    ${products.sort((a, b) => b.purchasedValue - a.purchasedValue).map(p => `
    <tr>
      <td class="mono">${esc(p.code)}</td>
      <td>${esc(p.shortName || p.description)}</td>
      <td class="text-right mono">${fmtNum(p.purchasedQty)}</td>
      <td class="text-right mono">${fmtCurrency(p.purchasedValue)}</td>
      <td class="text-right mono">${fmtNum(p.soldQty)}</td>
      <td class="text-right mono">${fmtCurrency(p.soldValue)}</td>
      <td class="text-right mono ${p.netQty > 0 ? 'positive' : p.netQty < 0 ? 'negative' : ''}" style="font-weight:700">${p.netQty > 0 ? '+' : ''}${fmtNum(p.netQty)}</td>
      <td class="text-right mono">${p.avgPurchasePrice != null ? fmtCurrency(p.avgPurchasePrice) : '—'}</td>
      <td class="text-right mono">${p.avgSalePrice != null ? fmtCurrency(p.avgSalePrice) : '—'}</td>
    </tr>
    `).join('')}
    <tr class="total-row">
      <td colspan="2">TOTAL</td>
      <td class="text-right mono">${fmtNum(purchasedQty)}</td>
      <td class="text-right mono">${fmtCurrency(purchasedValue)}</td>
      <td class="text-right mono">${fmtNum(soldQty)}</td>
      <td class="text-right mono">${fmtCurrency(soldValue)}</td>
      <td class="text-right mono ${netQty > 0 ? 'positive' : netQty < 0 ? 'negative' : ''}" style="font-weight:700">${netQty > 0 ? '+' : ''}${fmtNum(netQty)}</td>
      <td class="text-right mono">${purchasedQty > 0 ? fmtCurrency(purchasedValue / purchasedQty) : '—'}</td>
      <td class="text-right mono">${soldQty > 0 ? fmtCurrency(soldValue / soldQty) : '—'}</td>
    </tr>
  </tbody>
</table>
</body>
</html>`;
}

/* ── Generate PDF buffer ── */

async function generatePdf(html: string): Promise<Buffer> {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({
      format: 'A4',
      landscape: true,
      printBackground: true,
      margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

/* ── Send email ── */

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function sendEmail(to: string, pdfBuffer: Buffer): Promise<void> {
  if (!process.env.SMTP_PASS) {
    throw new Error('SMTP_PASS não configurado no servidor');
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.office365.com',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: false,
    auth: {
      user: process.env.SMTP_USER || 'adm@qlmed.com.br',
      pass: process.env.SMTP_PASS || '',
    },
  });

  const today = new Date().toLocaleDateString('pt-BR');

  await transporter.sendMail({
    from: `"QL MED" <${process.env.SMTP_USER || 'adm@qlmed.com.br'}>`,
    to,
    subject: `Relatório Válvulas Mecânicas Corcym — ${today}`,
    text: `Segue em anexo o relatório consolidado de válvulas mecânicas Corcym, gerado em ${today}.`,
    attachments: [
      {
        filename: `valvulas-corcym-${new Date().toISOString().slice(0, 10)}.pdf`,
        content: pdfBuffer,
        contentType: 'application/pdf',
      },
    ],
  });
}

/* ── Fetch report data from internal API ── */

async function fetchReportData(req: NextRequest): Promise<ReportData> {
  const origin = req.nextUrl.origin;
  const cookie = req.headers.get('cookie') || '';
  const res = await fetch(`${origin}/api/reports/valvulas-importadas`, {
    headers: { cookie },
  });
  if (!res.ok) throw new Error(`Report API returned ${res.status}`);
  return res.json();
}

/* ── Route handler ── */

export async function GET(req: NextRequest) {
  try {
    await requireAuth();
  } catch {
    return unauthorizedResponse();
  }

  const action = req.nextUrl.searchParams.get('action') || 'download';
  const to = req.nextUrl.searchParams.get('to') || '';

  try {
    const data = await fetchReportData(req);
    const html = buildHtml(data);
    const pdfBuffer = await generatePdf(html);

    if (action === 'email') {
      if (!to) {
        return NextResponse.json({ error: 'Parâmetro "to" obrigatório' }, { status: 400 });
      }
      if (!EMAIL_REGEX.test(to)) {
        return NextResponse.json({ error: 'Endereço de email inválido' }, { status: 400 });
      }
      await sendEmail(to, pdfBuffer);
      return NextResponse.json({ ok: true });
    }

    // Default: download
    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="valvulas-corcym-${new Date().toISOString().slice(0, 10)}.pdf"`,
      },
    });
  } catch (err: any) {
    console.error('[valvulas-importadas/pdf]', err);
    return NextResponse.json({ error: err.message || 'Erro ao gerar PDF' }, { status: 500 });
  }
}
