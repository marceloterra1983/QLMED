#!/usr/bin/env node
/**
 * Auditoria: OUT com lote vazio vs IN com lote (notas received desde 2021).
 * --apply-safe: copia lote(+expiry) do único IN da mesma invoiceId+product_codigo.
 *
 * Usage:
 *   node ops/scripts/qlmed-stock-lot-gap-audit.mjs
 *   node ops/scripts/qlmed-stock-lot-gap-audit.mjs --apply-safe
 *   node ops/scripts/qlmed-stock-lot-gap-audit.mjs --help
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pg = require('pg');

function usage() {
  console.log(`Usage:
  node ops/scripts/qlmed-stock-lot-gap-audit.mjs [--apply-safe]
  node ops/scripts/qlmed-stock-lot-gap-audit.mjs --help

Relatório de OUT (qualquer kind) com lot vazio em produtos que têm IN ENTRADA_NFE
com lote. --apply-safe só altera OUT quando invoice_id+product_codigo têm
exatamente um lote IN não vazio — copia lot e lot_expiry desse IN.`);
}

function loadEnv() {
  const raw = readFileSync('/srv/qlmed/env/app.env', 'utf8');
  const line = raw.split('\n').find((l) => l.startsWith('DATABASE_URL='));
  if (!line) throw new Error('DATABASE_URL ausente');
  return line.slice(13).trim().replace(/^['"]|['"]$/g, '').replace('@qlmed-db:', '@127.0.0.1:');
}

function normLot(s) {
  return String(s || '').trim();
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    usage();
    return;
  }
  const applySafe = args.includes('--apply-safe');
  const client = new pg.Client({ connectionString: loadEnv() });
  await client.connect();
  try {
    const summary = (
      await client.query(`
      select
        count(*) filter (where sm.direction='OUT' and nullif(trim(sm.lot),'') is null)::int as out_empty_lot,
        count(*) filter (where sm.direction='IN' and sm.kind='ENTRADA_NFE' and nullif(trim(sm.lot),'') is not null)::int as in_with_lot,
        count(distinct sm.product_codigo) filter (
          where sm.direction='OUT' and nullif(trim(sm.lot),'') is null
            and exists (
              select 1 from stock_movement i
              where i.product_codigo = sm.product_codigo
                and i.kind='ENTRADA_NFE' and i.direction='IN'
                and nullif(trim(i.lot),'') is not null
            )
        )::int as produtos_com_gap
      from stock_movement sm
      left join "Invoice" i on i.id = sm.invoice_id
      where (i.id is null or i."issueDate" >= timestamp '2021-01-01' or sm.invoice_id is null)
    `)
    ).rows[0];

    const safeCandidates = (
      await client.query(`
      with in_lots as (
        select invoice_id, product_codigo,
               array_agg(distinct trim(lot)) filter (where nullif(trim(lot),'') is not null) as lots,
               max(lot_expiry) filter (where nullif(trim(lot),'') is not null) as sample_expiry
        from stock_movement
        where kind='ENTRADA_NFE' and direction='IN' and invoice_id is not null
        group by invoice_id, product_codigo
        having count(distinct nullif(trim(lot),'')) = 1
      )
      select o.id, o.invoice_id, o.product_codigo, o.quantity,
             in_lots.lots[1] as lot, in_lots.sample_expiry as lot_expiry
      from stock_movement o
      join in_lots on in_lots.invoice_id = o.invoice_id and in_lots.product_codigo = o.product_codigo
      where o.direction='OUT' and nullif(trim(o.lot),'') is null
      limit 5000
    `)
    ).rows;

    console.log(
      JSON.stringify(
        {
          summary,
          safeCandidates: safeCandidates.length,
          sample: safeCandidates.slice(0, 8).map((r) => ({
            id: r.id,
            invoice_id: r.invoice_id,
            codigo: r.product_codigo,
            lot: r.lot,
          })),
          applySafe,
        },
        null,
        2,
      ),
    );

    if (!applySafe) {
      console.log('AUDIT ok — passe --apply-safe para copiar lote nos candidatos seguros');
      return;
    }

    await client.query('BEGIN');
    let n = 0;
    try {
      for (const r of safeCandidates) {
        const lot = normLot(r.lot);
        if (!lot) continue;
        const res = await client.query(
          `update stock_movement
           set lot = $1, lot_expiry = coalesce(nullif(trim(lot_expiry),''), $2)
           where id = $3 and direction='OUT' and (lot is null or trim(lot)='')`,
          [lot, r.lot_expiry, r.id],
        );
        if (res.rowCount === 1) n++;
      }
      await client.query('COMMIT');
      console.log(JSON.stringify({ applied: n }));
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
