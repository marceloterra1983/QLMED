import { NextResponse } from 'next/server';
import { requireEditor, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import { ensureProductRegistryTable } from '@/lib/product-registry-store';
import {
  ensureProductSettingsCatalogTable,
  listProductSettingsCatalogEntries,
  upsertProductSettingsCatalogEntry,
} from '@/lib/product-settings-catalog';
import prisma from '@/lib/prisma';

type LineNode = {
  name: string;
  count: number;
  groups: GroupNode[];
};

type GroupNode = {
  name: string;
  count: number;
  subgroups: SubgroupNode[];
};

type SubgroupNode = {
  name: string;
  count: number;
};

type ManufacturerNode = {
  name: string;
  count: number;
  shortName: string | null;
};

type FiscalItemNode = {
  value: string;
  count: number;
};

function sortByName<T extends { name: string }>(left: T, right: T) {
  return left.name.localeCompare(right.name, 'pt-BR');
}

function sortByValue<T extends { value: string }>(left: T, right: T) {
  return left.value.localeCompare(right.value, 'pt-BR');
}

function clean(value: unknown): string | null {
  const normalized = String(value ?? '').trim();
  return normalized.length > 0 ? normalized : null;
}

export async function GET() {
  try {
    let auth: { userId: string; role: string };
    try {
      auth = await requireEditor();
    } catch (error: any) {
      if (error?.message === 'FORBIDDEN') return forbiddenResponse();
      return unauthorizedResponse();
    }

    const company = await getOrCreateSingleCompany(auth.userId);
    await Promise.all([ensureProductRegistryTable(), ensureProductSettingsCatalogTable()]);

    const [lineRows, manufacturerRows, ncmRows, sitRows, nomeRows, cestRows, origemRows, cfopEntradaRows, cfopSaidaRows, catalogEntries] = await Promise.all([
      prisma.$queryRawUnsafe<any[]>(
        `
          SELECT
            TRIM(product_type) AS type_name,
            NULLIF(TRIM(product_subtype), '') AS subtype_name,
            NULLIF(TRIM(product_subgroup), '') AS subgroup_name,
            COUNT(*)::int AS count
          FROM product_registry
          WHERE company_id = $1
            AND product_key NOT LIKE '__%placeholder__%'
            AND product_type IS NOT NULL
            AND TRIM(product_type) <> ''
          GROUP BY
            TRIM(product_type),
            NULLIF(TRIM(product_subtype), ''),
            NULLIF(TRIM(product_subgroup), '')
        `,
        company.id,
      ),
      prisma.$queryRawUnsafe<any[]>(
        `
          SELECT
            TRIM(anvisa_manufacturer) AS name,
            NULLIF(MAX(NULLIF(TRIM(manufacturer_short_name), '')), '') AS short_name,
            COUNT(*)::int AS count
          FROM product_registry
          WHERE company_id = $1
            AND product_key NOT LIKE '__%placeholder__%'
            AND anvisa_manufacturer IS NOT NULL
            AND TRIM(anvisa_manufacturer) <> ''
          GROUP BY TRIM(anvisa_manufacturer)
        `,
        company.id,
      ),
      prisma.$queryRawUnsafe<any[]>(
        `
          SELECT
            TRIM(ncm) AS value,
            COUNT(*)::int AS count
          FROM product_registry
          WHERE company_id = $1
            AND product_key NOT LIKE '__%placeholder__%'
            AND ncm IS NOT NULL
            AND TRIM(ncm) <> ''
          GROUP BY TRIM(ncm)
        `,
        company.id,
      ),
      prisma.$queryRawUnsafe<any[]>(
        `
          SELECT
            TRIM(fiscal_sit_tributaria) AS value,
            COUNT(*)::int AS count
          FROM product_registry
          WHERE company_id = $1
            AND product_key NOT LIKE '__%placeholder__%'
            AND fiscal_sit_tributaria IS NOT NULL
            AND TRIM(fiscal_sit_tributaria) <> ''
          GROUP BY TRIM(fiscal_sit_tributaria)
        `,
        company.id,
      ),
      prisma.$queryRawUnsafe<any[]>(
        `
          SELECT
            TRIM(fiscal_nome_tributacao) AS value,
            COUNT(*)::int AS count
          FROM product_registry
          WHERE company_id = $1
            AND product_key NOT LIKE '__%placeholder__%'
            AND fiscal_nome_tributacao IS NOT NULL
            AND TRIM(fiscal_nome_tributacao) <> ''
          GROUP BY TRIM(fiscal_nome_tributacao)
        `,
        company.id,
      ),
      prisma.$queryRawUnsafe<any[]>(
        `
          SELECT
            TRIM(fiscal_cest) AS value,
            COUNT(*)::int AS count
          FROM product_registry
          WHERE company_id = $1
            AND product_key NOT LIKE '__%placeholder__%'
            AND fiscal_cest IS NOT NULL
            AND TRIM(fiscal_cest) <> ''
          GROUP BY TRIM(fiscal_cest)
        `,
        company.id,
      ),
      prisma.$queryRawUnsafe<any[]>(
        `
          SELECT
            TRIM(fiscal_origem) AS value,
            COUNT(*)::int AS count
          FROM product_registry
          WHERE company_id = $1
            AND product_key NOT LIKE '__%placeholder__%'
            AND fiscal_origem IS NOT NULL
            AND TRIM(fiscal_origem) <> ''
          GROUP BY TRIM(fiscal_origem)
        `,
        company.id,
      ),
      prisma.$queryRawUnsafe<any[]>(
        `
          SELECT
            TRIM(fiscal_cfop_entrada) AS value,
            COUNT(*)::int AS count
          FROM product_registry
          WHERE company_id = $1
            AND product_key NOT LIKE '__%placeholder__%'
            AND fiscal_cfop_entrada IS NOT NULL
            AND TRIM(fiscal_cfop_entrada) <> ''
          GROUP BY TRIM(fiscal_cfop_entrada)
        `,
        company.id,
      ),
      prisma.$queryRawUnsafe<any[]>(
        `
          SELECT
            TRIM(fiscal_cfop_saida) AS value,
            COUNT(*)::int AS count
          FROM product_registry
          WHERE company_id = $1
            AND product_key NOT LIKE '__%placeholder__%'
            AND fiscal_cfop_saida IS NOT NULL
            AND TRIM(fiscal_cfop_saida) <> ''
          GROUP BY TRIM(fiscal_cfop_saida)
        `,
        company.id,
      ),
      listProductSettingsCatalogEntries(company.id),
    ]);

    await seedDefaultFiscalCatalog(company.id, catalogEntries);

    const lineMap = new Map<string, { count: number; groups: Map<string, { count: number; subgroups: Map<string, number> }> }>();

    for (const row of lineRows) {
      const lineName = clean(row.type_name);
      const subtypeName = clean(row.subtype_name);
      const subgroupName = clean(row.subgroup_name);
      const count = Number(row.count) || 0;
      if (!lineName) continue;

      let lineNode = lineMap.get(lineName);
      if (!lineNode) {
        lineNode = { count: 0, groups: new Map() };
        lineMap.set(lineName, lineNode);
      }
      lineNode.count += count;

      if (!subtypeName) continue;
      let groupNode = lineNode.groups.get(subtypeName);
      if (!groupNode) {
        groupNode = { count: 0, subgroups: new Map() };
        lineNode.groups.set(subtypeName, groupNode);
      }
      groupNode.count += count;

      if (subgroupName) {
        groupNode.subgroups.set(subgroupName, (groupNode.subgroups.get(subgroupName) || 0) + count);
      }
    }

    const manufacturerMap = new Map<string, ManufacturerNode>();
    for (const row of manufacturerRows) {
      const name = clean(row.name);
      if (!name) continue;
      manufacturerMap.set(name, {
        name,
        count: Number(row.count) || 0,
        shortName: clean(row.short_name),
      });
    }

    const ncmMap = new Map<string, number>();
    const sitMap = new Map<string, number>();
    const nomeMap = new Map<string, number>();
    const cestMap = new Map<string, number>();
    const origemMap = new Map<string, number>();
    const cfopEntradaMap = new Map<string, number>();
    const cfopSaidaMap = new Map<string, number>();

    for (const row of ncmRows) {
      const value = clean(row.value);
      if (!value) continue;
      ncmMap.set(value, Number(row.count) || 0);
    }
    for (const row of sitRows) {
      const value = clean(row.value);
      if (!value) continue;
      sitMap.set(value, Number(row.count) || 0);
    }
    for (const row of nomeRows) {
      const value = clean(row.value);
      if (!value) continue;
      nomeMap.set(value, Number(row.count) || 0);
    }
    for (const row of cestRows) {
      const value = clean(row.value);
      if (!value) continue;
      cestMap.set(value, Number(row.count) || 0);
    }
    for (const row of origemRows) {
      const value = clean(row.value);
      if (!value) continue;
      origemMap.set(value, Number(row.count) || 0);
    }
    for (const row of cfopEntradaRows) {
      const value = clean(row.value);
      if (!value) continue;
      cfopEntradaMap.set(value, Number(row.count) || 0);
    }
    for (const row of cfopSaidaRows) {
      const value = clean(row.value);
      if (!value) continue;
      cfopSaidaMap.set(value, Number(row.count) || 0);
    }

    for (const entry of catalogEntries) {
      const value = clean(entry.value);
      if (!value) continue;

      if (entry.section === 'line') {
        if (!lineMap.has(value)) lineMap.set(value, { count: 0, groups: new Map() });
        continue;
      }

      if (entry.section === 'group') {
        const parent = clean(entry.parentValue);
        if (!parent) continue;
        let lineNode = lineMap.get(parent);
        if (!lineNode) {
          lineNode = { count: 0, groups: new Map() };
          lineMap.set(parent, lineNode);
        }
        if (!lineNode.groups.has(value)) {
          lineNode.groups.set(value, { count: 0, subgroups: new Map() });
        }
        continue;
      }

      if (entry.section === 'subgroup') {
        const parentLine = clean(entry.parentValue);
        const parentGroup = clean(entry.parentSecondaryValue);
        if (!parentLine || !parentGroup) continue;

        let lineNode = lineMap.get(parentLine);
        if (!lineNode) {
          lineNode = { count: 0, groups: new Map() };
          lineMap.set(parentLine, lineNode);
        }
        let groupNode = lineNode.groups.get(parentGroup);
        if (!groupNode) {
          groupNode = { count: 0, subgroups: new Map() };
          lineNode.groups.set(parentGroup, groupNode);
        }
        if (!groupNode.subgroups.has(value)) {
          groupNode.subgroups.set(value, 0);
        }
        continue;
      }

      if (entry.section === 'manufacturer') {
        const shortName = clean(entry.extraValue);
        const existing = manufacturerMap.get(value);
        if (existing) {
          if (shortName !== null) existing.shortName = shortName;
        } else {
          manufacturerMap.set(value, {
            name: value,
            count: 0,
            shortName,
          });
        }
        continue;
      }

      if (entry.section === 'fiscal_ncm') {
        if (!ncmMap.has(value)) ncmMap.set(value, 0);
        continue;
      }

      if (entry.section === 'fiscal_sit_tributaria') {
        if (!sitMap.has(value)) sitMap.set(value, 0);
        continue;
      }

      if (entry.section === 'fiscal_nome_tributacao') {
        if (!nomeMap.has(value)) nomeMap.set(value, 0);
        continue;
      }

      if (entry.section === 'fiscal_cest') {
        if (!cestMap.has(value)) cestMap.set(value, 0);
        continue;
      }

      if (entry.section === 'fiscal_origem') {
        if (!origemMap.has(value)) origemMap.set(value, 0);
        continue;
      }

      if (entry.section === 'fiscal_cfop_entrada') {
        if (!cfopEntradaMap.has(value)) cfopEntradaMap.set(value, 0);
        continue;
      }

      if (entry.section === 'fiscal_cfop_saida') {
        if (!cfopSaidaMap.has(value)) cfopSaidaMap.set(value, 0);
      }
    }

    const lines: LineNode[] = Array.from(lineMap.entries())
      .map(([lineName, lineNode]) => {
        const groups: GroupNode[] = Array.from(lineNode.groups.entries())
          .map(([groupName, groupNode]) => ({
            name: groupName,
            count: groupNode.count,
            subgroups: Array.from(groupNode.subgroups.entries())
              .map(([subgroupName, subgroupCount]) => ({
                name: subgroupName,
                count: subgroupCount,
              }))
              .sort(sortByName),
          }))
          .sort(sortByName);

        return {
          name: lineName,
          count: lineNode.count,
          groups,
        };
      })
      .sort(sortByName);

    const manufacturers: ManufacturerNode[] = Array.from(manufacturerMap.values()).sort(sortByName);

    const fiscalNcm: FiscalItemNode[] = Array.from(ncmMap.entries())
      .map(([value, count]) => ({ value, count }))
      .sort(sortByValue);
    const fiscalSitTributaria: FiscalItemNode[] = Array.from(sitMap.entries())
      .map(([value, count]) => ({ value, count }))
      .sort(sortByValue);
    const fiscalNomeTributacao: FiscalItemNode[] = Array.from(nomeMap.entries())
      .map(([value, count]) => ({ value, count }))
      .sort(sortByValue);
    const fiscalCest: FiscalItemNode[] = Array.from(cestMap.entries())
      .map(([value, count]) => ({ value, count }))
      .sort(sortByValue);
    const fiscalOrigem: FiscalItemNode[] = Array.from(origemMap.entries())
      .map(([value, count]) => ({ value, count }))
      .sort(sortByValue);
    const fiscalCfopEntrada: FiscalItemNode[] = Array.from(cfopEntradaMap.entries())
      .map(([value, count]) => ({ value, count }))
      .sort(sortByValue);
    const fiscalCfopSaida: FiscalItemNode[] = Array.from(cfopSaidaMap.entries())
      .map(([value, count]) => ({ value, count }))
      .sort(sortByValue);

    return NextResponse.json({
      lines,
      manufacturers,
      fiscal: {
        ncm: fiscalNcm,
        fiscalSitTributaria,
        fiscalNomeTributacao,
        cest: fiscalCest,
        origem: fiscalOrigem,
        cfopEntrada: fiscalCfopEntrada,
        cfopSaida: fiscalCfopSaida,
      },
    });
  } catch (error) {
    console.error('Error fetching product settings:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

/* ─── Seed default fiscal catalog values ─── */

import type { ProductSettingsCatalogSection, ProductSettingsCatalogEntry } from '@/lib/product-settings-catalog';

const DEFAULT_FISCAL_SEEDS: { section: ProductSettingsCatalogSection; values: string[] }[] = [
  {
    section: 'fiscal_sit_tributaria',
    values: [
      '00 – Tributada integralmente',
      '10 – Tributada com cobrança do ICMS por ST',
      '20 – Com redução de base de cálculo',
      '30 – Isenta/não tributada com cobrança do ICMS por ST',
      '40 – Isenta',
      '41 – Não tributada',
      '50 – Suspensão',
      '51 – Diferimento',
      '60 – ICMS cobrado anteriormente por ST',
      '70 – Com redução de base de cálculo e cobrança do ICMS por ST',
      '90 – Outras',
    ],
  },
  {
    section: 'fiscal_origem',
    values: [
      '0 – Nacional',
      '1 – Estrangeira (importação direta)',
      '2 – Estrangeira (mercado interno)',
      '3 – Nacional >40% conteúdo importado',
      '5 – Nacional ≤40% conteúdo importado',
      '8 – Nacional >70% conteúdo importado',
    ],
  },
  {
    section: 'fiscal_cfop_saida',
    values: [
      '5102 – Venda de mercadoria adquirida',
      '5405 – Venda de mercadoria adquirida com ST',
      '5551 – Venda de bem do ativo imobilizado',
      '5912 – Remessa em consignação',
      '5917 – Remessa de mercadoria em consignação',
      '6102 – Venda interestadual de mercadoria adquirida',
      '6108 – Venda interestadual de mercadoria a consumidor final',
    ],
  },
  {
    section: 'fiscal_cfop_entrada',
    values: [
      '1202 – Devolução de venda de mercadoria',
      '1908 – Retorno de remessa para conserto',
      '1949 – Outra entrada não especificada',
      '2202 – Devolução interestadual de venda',
      '2949 – Outra entrada interestadual não especificada',
      '3102 – Compra do exterior para comercialização',
    ],
  },
];

async function seedDefaultFiscalCatalog(
  companyId: string,
  existingEntries: ProductSettingsCatalogEntry[],
) {
  const existingSections = new Set(existingEntries.map((e) => e.section));

  for (const seed of DEFAULT_FISCAL_SEEDS) {
    if (existingSections.has(seed.section)) continue;

    for (const value of seed.values) {
      await upsertProductSettingsCatalogEntry({
        companyId,
        section: seed.section,
        value,
      });
    }
  }
}
