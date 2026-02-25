#!/usr/bin/env node
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
function hasMatch(value, regex) {
  if (!value) return false;
  return regex.test(value);
}
(async () => {
  try {
    const rows = await prisma.$queryRawUnsafe(`
      SELECT id, code, description, ncm
      FROM product_registry
      WHERE COALESCE(product_type,'') = ''
    `);
    if (!rows.length) {
      console.log(JSON.stringify({updated:0, scanned:0}, null, 2));
      return;
    }
    const heuristics = [
      {
        type: 'Materiais Hospitalares',
        subtype: 'Material de Punção e Infusão',
        test: (row) => hasMatch(row.description, /\b(luva|luvas|cateter|canula|sonda|seringa|agulha|respirador)\b/i),
      },
      {
        type: 'HEMODINAMICA',
        subtype: 'HEMODINAMICA - OUTROS',
        test: (row) => hasMatch(row.description, /\b(stent|bal[aã]o|angiograf|cateter|f[io]o\s+guia|introdu|bainha)\b/i),
      },
      {
        type: 'CARDIACA',
        subtype: 'CARDIACA - OUTROS',
        test: (row) => hasMatch(row.description, /\b(valvula|anel|aort|mitral|cec|marcapasso|drill|cureta)\b/i),
      },
      {
        type: 'INSUMOS OPERACIONAIS',
        subtype: 'INSUMOS OPERACIONAIS - OUTROS',
        test: (row) => {
          const prefix = String(row.ncm || '').slice(0, 2);
          return ['27', '32', '34', '38', '40', '48', '68'].includes(prefix);
        },
      },
      {
        type: 'TI_TELECOM',
        subtype: 'TI_TELECOM - APARELHOS',
        test: (row) => {
          const prefix = String(row.ncm || '').slice(0, 2);
          return prefix === '85' || hasMatch(row.description, /\b(iphone|samsung|sim card|mob[ií]l|smartphone|chip)\b/i);
        },
      },
      {
        type: 'FROTA_AUTOMOTIVA',
        subtype: 'FROTA_AUTOMOTIVA - OUTROS',
        test: (row) => {
          const prefix = String(row.ncm || '').slice(0, 2);
          return prefix === '87' || hasMatch(row.description, /\b(pneu|freio|rodizio|past[ea]\s+freio)\b/i);
        },
      },
      {
        type: 'COPA_COZINHA_EVENTOS',
        subtype: 'COPA_COZINHA_EVENTOS - OUTROS',
        test: (row) => {
          const prefix = String(row.ncm || '').slice(0, 2);
          return ['22', '21'].includes(prefix) || hasMatch(row.description, /\b(agua|cafe|suqueira|servi[cç]o?)\b/i);
        },
      },
      {
        type: 'SERVICOS',
        subtype: 'SERVICOS - OUTROS',
        test: (row) => hasMatch(row.description, /\b(servi[cç]o|consultoria|assinatura|certifica[cç][aã]o)\b/i),
      },
    ];

    const updates = [];
    for (const row of rows) {
      const normalized = String(row.description || '').replace(/\s+/g, ' ').trim();
      let applied = false;
      for (const rule of heuristics) {
        if (rule.test({ ...row, description: normalized })) {
          updates.push({ id: row.id, type: rule.type, subtype: rule.subtype });
          applied = true;
          break;
        }
      }
      if (!applied) {
        // fallback: keep OUTROS to avoid misclassification
      }
    }

    for (const change of updates) {
      await prisma.$executeRawUnsafe(
        `UPDATE product_registry SET product_type = $2, product_subtype = $3, updated_at = NOW() WHERE id = $1`,
        change.id,
        change.type,
        change.subtype,
      );
    }

    console.log(JSON.stringify({ scanned: rows.length, updated: updates.length }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
})();
