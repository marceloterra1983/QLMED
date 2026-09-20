#!/usr/bin/env -S node --experimental-strip-types
/**
 * Incorpora lotes da planilha E509 (ODS/TSV) e validade do XML nas entradas
 * ENTRADA_NFE. Default: dry-run. Use --apply para gravar.
 *
 * Usage:
 *   node ops/scripts/qlmed-e509-incorporate.mjs --sheet /path/file.ods
 *   node ops/scripts/qlmed-e509-incorporate.mjs --sheet /path/file.ods --apply
 *   node ops/scripts/qlmed-e509-incorporate.mjs --help
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { resolveUniqueLotExpiryFromXml } from '../../src/lib/e509/lot-expiry.ts';
import { streamOdsRows } from '../../src/lib/ods-rows.ts';

const require = createRequire(import.meta.url);
const pg = require('pg');

function usage() {
  console.log(`Usage:
  node ops/scripts/qlmed-e509-incorporate.mjs --sheet <arquivo.ods|tsv> [--apply]
  node ops/scripts/qlmed-e509-incorporate.mjs --help

Dry-run por padrão. Preenche lot vazio (match único por invoice+codigo) e
lot_expiry vazio/sentinela quando o XML da mesma nota tem data única para o lote.
Não sobrescreve validade real diferente. Não altera quantity.`);
}

function loadEnv() {
  const raw = readFileSync('/srv/qlmed/env/app.env', 'utf8');
  const line = raw.split('\n').find((l) => l.startsWith('DATABASE_URL='));
  if (!line) throw new Error('DATABASE_URL ausente em /srv/qlmed/env/app.env');
  return line.slice(13).trim().replace(/^['"]|['"]$/g, '').replace('@qlmed-db:', '@127.0.0.1:');
}

function normLot(s) {
  return String(s || '').trim().toUpperCase().replace(/\s+/g, '');
}
function alnum(s) {
  return normLot(s).replace(/[^A-Z0-9]/g, '');
}
function isoDate(raw) {
  const s = String(raw || '').trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return '';
}
function isSentinel(iso) {
  return !iso ? false : iso.startsWith('2099-') || iso.startsWith('9999-') || iso.startsWith('2999-');
}

async function loadOdsRows(buf) {
  const out = [];
  await streamOdsRows(buf, (row) => {
    if (row.index0 < 4) return;
    const key = String(row.cells[8] || '').replace(/\D/g, '');
    const lote = row.str(82);
    if (key && lote) {
      out.push({
        key,
        codigo: row.str(32),
        lote,
        canc: row.str(31),
        nf: row.str(0).replace(/^0+/, ''),
        ref: row.str(33),
      });
    }
  });
  return out;
}

async function loadSheetRows(sheetPath) {
  const abs = resolve(sheetPath);
  if (abs.endsWith('.tsv')) {
    return readFileSync(abs, 'utf8')
      .trim()
      .split('\n')
      .map((line) => {
        const [key, codigo, lote, canc, nf, qtde, ref = ''] = line.split('\t');
        return { key, codigo, lote: (lote || '').trim(), canc, nf, ref };
      })
      .filter((r) => r.key && r.lote);
  }
  if (abs.toLowerCase().endsWith('.ods')) {
    return loadOdsRows(readFileSync(abs));
  }
  throw new Error('Use .ods ou .tsv. XLSX: POST /api/estoque/import-e509');
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.length === 0) {
    usage();
    process.exit(args.includes('--help') ? 0 : 1);
  }
  const apply = args.includes('--apply');
  const sheetIdx = args.indexOf('--sheet');
  if (sheetIdx < 0 || !args[sheetIdx + 1]) {
    usage();
    process.exit(1);
  }
  const sheet = await loadSheetRows(args[sheetIdx + 1]);
  console.log(JSON.stringify({ sheetRows: sheet.length, apply, mode: apply ? 'APPLY' : 'DRY_RUN' }));

  const client = new pg.Client({ connectionString: loadEnv() });
  await client.connect();
  try {
    const keys = [...new Set(sheet.map((r) => r.key))];
    const invoices = [];
    for (let i = 0; i < keys.length; i += 200) {
      const batch = keys.slice(i, i + 200);
      const { rows } = await client.query(
        `select id, "accessKey" as key, direction, "xmlContent" as xml
         from "Invoice" where "accessKey" = any($1::text[])`,
        [batch],
      );
      invoices.push(...rows);
    }
    const byKey = new Map(invoices.map((i) => [i.key, i]));
    const received = invoices.filter((i) => i.direction === 'received');
    const movs = [];
    for (let i = 0; i < received.length; i += 200) {
      const batch = received.slice(i, i + 200).map((r) => r.id);
      const { rows } = await client.query(
        `select id, invoice_id, product_codigo, lot, lot_expiry, quantity
         from stock_movement
         where invoice_id = any($1::text[]) and kind='ENTRADA_NFE' and direction='IN'`,
        [batch],
      );
      movs.push(...rows);
    }
    const byInv = new Map();
    for (const m of movs) {
      if (!byInv.has(m.invoice_id)) byInv.set(m.invoice_id, []);
      byInv.get(m.invoice_id).push(m);
    }

    const lotUpdates = [];
    const expUpdates = [];
    for (const r of sheet) {
      const inv = byKey.get(r.key);
      if (!inv || inv.direction !== 'received') continue;
      const list = byInv.get(inv.id) || [];
      const lot = normLot(r.lote);
      const lotA = alnum(r.lote);
      const cands = list.filter((m) => normLot(m.lot) === lot || (lotA && alnum(m.lot) === lotA));
      if (cands.length === 0) {
        const empty = list.filter((m) => m.product_codigo === r.codigo && !normLot(m.lot));
        if (empty.length === 1) {
          lotUpdates.push({ id: empty[0].id, lot: r.lote, qty: Number(empty[0].quantity), codigo: r.codigo });
        }
        continue;
      }
      const date = resolveUniqueLotExpiryFromXml(inv.xml, r.lote);
      if (!date) continue;
      for (const m of cands) {
        const cur = isoDate(m.lot_expiry);
        if (cur === date) continue;
        if (cur && !isSentinel(cur)) continue;
        expUpdates.push({ id: m.id, date, qty: Number(m.quantity), lot: m.lot });
      }
    }

    const lotById = new Map();
    for (const u of lotUpdates) {
      if (lotById.has(u.id)) lotById.get(u.id).ambiguous = true;
      else lotById.set(u.id, u);
    }
    const lots = [...lotById.values()].filter((u) => !u.ambiguous);
    const expById = new Map();
    for (const u of expUpdates) if (!expById.has(u.id)) expById.set(u.id, u);
    const exps = [...expById.values()];

    console.log(JSON.stringify({ lotFill: lots.length, expiryFill: exps.length }));

    if (!apply) {
      console.log('DRY_RUN ok — passe --apply para gravar');
      return;
    }

    await client.query('BEGIN');
    let nLot = 0;
    let nExp = 0;
    try {
      for (const u of lots) {
        const res = await client.query(
          `update stock_movement set lot=$1
           where id=$2 and (lot is null or trim(lot)='') and quantity=$3 and product_codigo=$4
             and kind='ENTRADA_NFE' and direction='IN'`,
          [u.lot, u.id, u.qty, u.codigo],
        );
        if (res.rowCount !== 1) throw new Error(`lot fail ${u.id}`);
        nLot++;
      }
      for (const u of exps) {
        const res = await client.query(
          `update stock_movement set lot_expiry=$1
           where id=$2 and quantity=$3 and kind='ENTRADA_NFE' and direction='IN'
             and (lot_expiry is null or trim(lot_expiry)='' or lot_expiry like '2099%' or lot_expiry like '9999%')
             and upper(trim(lot))=upper(trim($4))`,
          [u.date, u.id, u.qty, u.lot],
        );
        if (res.rowCount !== 1) throw new Error(`exp fail ${u.id}`);
        nExp++;
      }
      await client.query('COMMIT');
      console.log(JSON.stringify({ committedLots: nLot, committedExpiry: nExp }));
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    }
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
