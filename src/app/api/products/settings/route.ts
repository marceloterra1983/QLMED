import { NextResponse } from 'next/server';
import { requireEditor, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import { ensureProductRegistryTable } from '@/lib/product-registry-store';
import {
  ensureProductSettingsCatalogTable,
  listProductSettingsCatalogEntries,
  upsertProductSettingsCatalogEntry,
  type ProductSettingsCatalogSection,
  type ProductSettingsCatalogEntry,
} from '@/lib/product-settings-catalog';

import { getCfopDescription } from '@/lib/cfop-descriptions';
import prisma from '@/lib/prisma';
import { createLogger } from '@/lib/logger';
import { apiError } from '@/lib/api-error';

const log = createLogger('products/settings');

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
  description?: string;
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
    } catch (error: unknown) {
      if (error instanceof Error && error.message === 'FORBIDDEN') return forbiddenResponse();
      return unauthorizedResponse();
    }

    const company = await getOrCreateSingleCompany(auth.userId);
    await Promise.all([ensureProductRegistryTable(), ensureProductSettingsCatalogTable()]);

    const [registryRows, catalogEntries] = await Promise.all([
      prisma.productRegistry.findMany({
        where: { companyId: company.id },
        select: {
          productKey: true,
          productType: true,
          productSubtype: true,
          productSubgroup: true,
          anvisaManufacturer: true,
          manufacturerShortName: true,
          ncm: true,
          fiscalSitTributaria: true,
          fiscalNomeTributacao: true,
          fiscalCest: true,
          fiscalOrigem: true,
          fiscalCfopEntrada: true,
          fiscalCfopSaida: true,
          fiscalObsIcms: true,
          fiscalObsPisCofins: true,
        },
      }),
      listProductSettingsCatalogEntries(company.id),
    ]);

    await seedDefaultFiscalCatalog(company.id, catalogEntries);

    const products = registryRows.filter((r) => !r.productKey.includes('placeholder'));

    const lineMap = new Map<
      string,
      { count: number; groups: Map<string, { count: number; subgroups: Map<string, number> }> }
    >();
    const manufacturerMap = new Map<string, ManufacturerNode>();
    const ncmMap = new Map<string, { count: number; description: string }>();
    const sitMap = new Map<string, number>();
    const nomeMap = new Map<string, number>();
    const cestMap = new Map<string, number>();
    const origemMap = new Map<string, number>();
    const cfopEntradaMap = new Map<string, number>();
    const cfopSaidaMap = new Map<string, number>();
    const obsIcmsMap = new Map<string, number>();
    const obsPisCofinsMap = new Map<string, number>();
    const aliqIcmsMap = new Map<string, number>();
    const aliqPisMap = new Map<string, number>();
    const aliqCofinsMap = new Map<string, number>();
    const aliqIpiMap = new Map<string, number>();
    const aliqFcpMap = new Map<string, number>();

    const bump = (map: Map<string, number>, value: string | null | undefined) => {
      const v = clean(value);
      if (!v) return;
      map.set(v, (map.get(v) || 0) + 1);
    };

    for (const row of products) {
      const lineName = clean(row.productType);
      const subtypeName = clean(row.productSubtype);
      const subgroupName = clean(row.productSubgroup);

      if (lineName) {
        let lineNode = lineMap.get(lineName);
        if (!lineNode) {
          lineNode = { count: 0, groups: new Map() };
          lineMap.set(lineName, lineNode);
        }
        lineNode.count += 1;
        if (subtypeName) {
          let groupNode = lineNode.groups.get(subtypeName);
          if (!groupNode) {
            groupNode = { count: 0, subgroups: new Map() };
            lineNode.groups.set(subtypeName, groupNode);
          }
          groupNode.count += 1;
          if (subgroupName) {
            groupNode.subgroups.set(
              subgroupName,
              (groupNode.subgroups.get(subgroupName) || 0) + 1,
            );
          }
        }
      }

      const mfrName =
        clean(row.anvisaManufacturer) || clean(row.manufacturerShortName);
      if (mfrName) {
        const existing = manufacturerMap.get(mfrName);
        if (existing) {
          existing.count += 1;
          const short = clean(row.manufacturerShortName);
          if (short) existing.shortName = short;
        } else {
          manufacturerMap.set(mfrName, {
            name: mfrName,
            count: 1,
            shortName: clean(row.manufacturerShortName),
          });
        }
      }

      const ncm = clean(row.ncm);
      if (ncm) {
        const prev = ncmMap.get(ncm);
        ncmMap.set(ncm, { count: (prev?.count || 0) + 1, description: prev?.description || '' });
      }

      bump(sitMap, row.fiscalSitTributaria);
      bump(nomeMap, row.fiscalNomeTributacao);
      bump(cestMap, row.fiscalCest);
      bump(origemMap, row.fiscalOrigem);
      bump(cfopEntradaMap, row.fiscalCfopEntrada);
      bump(cfopSaidaMap, row.fiscalCfopSaida);
      bump(obsIcmsMap, row.fiscalObsIcms);
      bump(obsPisCofinsMap, row.fiscalObsPisCofins);
    }

    // Enrich NCM descriptions from cache
    const ncmCodes = Array.from(ncmMap.keys()).map((v) =>
      v.replace(/[.\s]/g, '').trim(),
    );
    if (ncmCodes.length > 0) {
      const cacheRows = await prisma.ncmCache.findMany({
        where: { code: { in: ncmCodes } },
        select: { code: true, descricao: true },
      });
      const byCode = new Map(cacheRows.map((r) => [r.code, r.descricao || '']));
      for (const [value, data] of ncmMap) {
        const digits = value.replace(/[.\s]/g, '').trim();
        const desc = byCode.get(digits);
        if (desc) data.description = desc;
      }
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
        if (!ncmMap.has(value)) ncmMap.set(value, { count: 0, description: '' });
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
        continue;
      }

      if (entry.section === 'fiscal_obs_icms') {
        if (!obsIcmsMap.has(value)) obsIcmsMap.set(value, 0);
        continue;
      }

      if (entry.section === 'fiscal_obs_pis_cofins') {
        if (!obsPisCofinsMap.has(value)) obsPisCofinsMap.set(value, 0);
        continue;
      }

      if (entry.section === 'fiscal_aliq_icms')   { if (!aliqIcmsMap.has(value))   aliqIcmsMap.set(value, 0);   continue; }
      if (entry.section === 'fiscal_aliq_pis')    { if (!aliqPisMap.has(value))    aliqPisMap.set(value, 0);    continue; }
      if (entry.section === 'fiscal_aliq_cofins') { if (!aliqCofinsMap.has(value)) aliqCofinsMap.set(value, 0); continue; }
      if (entry.section === 'fiscal_aliq_ipi')    { if (!aliqIpiMap.has(value))    aliqIpiMap.set(value, 0);    continue; }
      if (entry.section === 'fiscal_aliq_fcp')    { if (!aliqFcpMap.has(value))    aliqFcpMap.set(value, 0);    continue; }
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
      .map(([value, data]) => ({ value, count: data.count, description: data.description || undefined }))
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
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
      .map(([value, count]) => ({ value, count, description: getCfopDescription(value) || undefined }))
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
    const fiscalCfopSaida: FiscalItemNode[] = Array.from(cfopSaidaMap.entries())
      .map(([value, count]) => ({ value, count, description: getCfopDescription(value) || undefined }))
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
    const fiscalObsIcms: FiscalItemNode[] = Array.from(obsIcmsMap.entries())
      .map(([value, count]) => ({ value, count }))
      .sort(sortByValue);
    const fiscalObsPisCofins: FiscalItemNode[] = Array.from(obsPisCofinsMap.entries())
      .map(([value, count]) => ({ value, count }))
      .sort(sortByValue);
    const sortByNumericValue = (a: FiscalItemNode, b: FiscalItemNode) =>
      (parseFloat(a.value) || 0) - (parseFloat(b.value) || 0);
    const fiscalAliqIcms:   FiscalItemNode[] = Array.from(aliqIcmsMap.entries()).map(([value, count]) => ({ value, count })).sort(sortByNumericValue);
    const fiscalAliqPis:    FiscalItemNode[] = Array.from(aliqPisMap.entries()).map(([value, count]) => ({ value, count })).sort(sortByNumericValue);
    const fiscalAliqCofins: FiscalItemNode[] = Array.from(aliqCofinsMap.entries()).map(([value, count]) => ({ value, count })).sort(sortByNumericValue);
    const fiscalAliqIpi:    FiscalItemNode[] = Array.from(aliqIpiMap.entries()).map(([value, count]) => ({ value, count })).sort(sortByNumericValue);
    const fiscalAliqFcp:    FiscalItemNode[] = Array.from(aliqFcpMap.entries()).map(([value, count]) => ({ value, count })).sort(sortByNumericValue);

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
        obsIcms: fiscalObsIcms,
        obsPisCofins: fiscalObsPisCofins,
        aliqIcms: fiscalAliqIcms,
        aliqPis: fiscalAliqPis,
        aliqCofins: fiscalAliqCofins,
        aliqIpi: fiscalAliqIpi,
        aliqFcp: fiscalAliqFcp,
      },
    });
  } catch (error) {
    return apiError(error, 'products/settings');
  }
}

/* ─── Seed default fiscal catalog values ─── */

const seededCompanies = new Set<string>();

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
      '5908 – Remessa em comodato',
      '5910 – Remessa em bonificação',
      '5911 – Remessa de amostra grátis',
      '5912 – Remessa em consignação',
      '5917 – Remessa de mercadoria em consignação',
      '5949 – Outras saídas não especificadas',
      '6102 – Venda interestadual de mercadoria adquirida',
      '6108 – Venda interestadual de mercadoria a consumidor final',
      '6202 – Devolução de compra interestadual',
      '6912 – Remessa em demonstração interestadual',
      '6949 – Outras saídas interestaduais',
    ],
  },
  {
    section: 'fiscal_cfop_entrada',
    values: [
      '1202 – Devolução de venda de mercadoria',
      '1908 – Retorno de remessa para conserto',
      '1909 – Retorno de comodato',
      '1918 – Devolução de consignação',
      '1949 – Outra entrada não especificada',
      '2202 – Devolução interestadual de venda',
      '2909 – Retorno de comodato interestadual',
      '2918 – Devolução de consignação interestadual',
      '2949 – Outra entrada interestadual não especificada',
      '3102 – Compra do exterior para comercialização',
    ],
  },
  {
    section: 'fiscal_cest',
    values: [
      '1300100 – Medicamentos de referência',
      '1300200 – Medicamentos genéricos',
      '1300300 – Medicamentos similares',
      '1300400 – Outros medicamentos',
      '1300500 – Preparações químicas contraceptivas',
      '1300600 – Provitaminas e vitaminas',
      '1300700 – Medicamentos à base de hormônios',
      '1300800 – Soros e vacinas',
      '1300900 – Algodão, gaze, atadura e artigos análogos',
      '1301000 – Artigos de laboratório ou farmácia',
      '1301100 – Luvas de borracha',
    ],
  },
  {
    section: 'fiscal_aliq_icms',
    values: ['0', '4', '7', '12', '17', '18', '19', '20', '25'],
  },
  {
    section: 'fiscal_aliq_pis',
    values: ['0', '0.65', '1.65', '2.1', '3.02'],
  },
  {
    section: 'fiscal_aliq_cofins',
    values: ['0', '3', '7.6', '9.75', '15'],
  },
  {
    section: 'fiscal_aliq_ipi',
    values: ['0', '5', '10', '15', '20', '25', '50', '300'],
  },
  {
    section: 'fiscal_aliq_fcp',
    values: ['0', '1', '2', '4'],
  },
];

async function seedDefaultFiscalCatalog(
  companyId: string,
  existingEntries: ProductSettingsCatalogEntry[],
) {
  if (seededCompanies.has(companyId)) return;

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

  seededCompanies.add(companyId);
}
