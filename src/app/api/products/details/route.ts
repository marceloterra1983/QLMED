import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, unauthorizedResponse } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import { apiError, apiValidationError } from '@/lib/api-error';

const productDetailsQuerySchema = z
  .object({
    key: z.string().optional(),
    code: z.string().optional(),
  })
  .refine((d) => Boolean(d.key || d.code), { message: 'Parâmetro key ou code obrigatório' });

export async function GET(req: Request) {
  try {
    let userId: string;
    try {
      userId = await requireAuth();
    } catch {
      return unauthorizedResponse();
    }

    const company = await getOrCreateSingleCompany(userId);

    const { searchParams } = new URL(req.url);
    const parsed = productDetailsQuerySchema.safeParse({
      key: searchParams.get('key') || undefined,
      code: searchParams.get('code') || undefined,
    });
    if (!parsed.success) return apiValidationError(parsed.error);
    const { key, code } = parsed.data;

    const row = key
      ? await prisma.productRegistry.findUnique({
          where: {
            companyId_productKey: { companyId: company.id, productKey: key },
          },
        })
      : await prisma.productRegistry.findFirst({
          where: { companyId: company.id, code: code! },
        });

    if (!row) {
      return NextResponse.json({ error: 'Produto não encontrado' }, { status: 404 });
    }

    return NextResponse.json({
      key: row.productKey,
      codigo: row.codigo || null,
      code: row.code || '-',
      description: row.description || '',
      ncm: row.ncm || null,
      unit: row.unit || '-',
      ean: row.ean || null,
      anvisa: row.anvisaCode || null,
      anvisaMatchMethod: row.anvisaSource || null,
      anvisaConfidence: row.anvisaConfidence != null ? Number(row.anvisaConfidence) : null,
      anvisaMatchedProductName: row.anvisaMatchedProductName || null,
      anvisaHolder: row.anvisaHolder || null,
      anvisaProcess: row.anvisaProcess || null,
      anvisaStatus: row.anvisaStatus || null,
      anvisaExpiration: row.anvisaExpiration || null,
      anvisaRiskClass: row.anvisaRiskClass || null,
      anvisaManufacturer: row.anvisaManufacturer || null,
      anvisaManufacturerCountry: row.anvisaManufacturerCountry || null,
      manufacturerShortName: row.manufacturerShortName || null,
      shortName: row.shortName || null,
      productType: row.productType || null,
      productSubtype: row.productSubtype || null,
      productSubgroup: row.productSubgroup || null,
      outOfLine: row.outOfLine === true,
      instrumental: row.instrumental === true,
      totalQuantity: Number(row.aggTotalQuantity || 0),
      invoiceCount: Number(row.aggInvoiceCount || 0),
      lastPrice: Number(row.aggLastPrice || 0),
      averagePrice: Number(row.aggAveragePrice || 0),
      lastIssueDate: row.aggLastIssueDate || null,
      lastSaleDate: row.aggLastSaleDate || null,
      lastSalePrice: row.aggLastSalePrice != null ? Number(row.aggLastSalePrice) : null,
      lastSupplierName: row.aggLastSupplierName || null,
      lastSupplierCnpj: row.aggLastSupplierCnpj || null,
      lastInvoiceNumber: row.aggLastInvoiceNumber || null,
      lastInvoiceId: null,
      fiscalSitTributaria: row.fiscalSitTributaria || null,
      fiscalNomeTributacao: row.fiscalNomeTributacao || null,
      fiscalIcms: row.fiscalIcms != null ? Number(row.fiscalIcms) : null,
      fiscalPis: row.fiscalPis != null ? Number(row.fiscalPis) : null,
      fiscalCofins: row.fiscalCofins != null ? Number(row.fiscalCofins) : null,
      fiscalObs: row.fiscalObs || null,
      fiscalCest: row.fiscalCest || null,
      fiscalOrigem: row.fiscalOrigem || null,
      fiscalCfopEntrada: row.fiscalCfopEntrada || null,
      fiscalCfopSaida: row.fiscalCfopSaida || null,
      fiscalIpi: row.fiscalIpi != null ? Number(row.fiscalIpi) : null,
      fiscalFcp: row.fiscalFcp != null ? Number(row.fiscalFcp) : null,
      fiscalCstIpi: row.fiscalCstIpi || null,
      fiscalCstPis: row.fiscalCstPis || null,
      fiscalCstCofins: row.fiscalCstCofins || null,
      fiscalObsIcms: row.fiscalObsIcms || null,
      fiscalObsPisCofins: row.fiscalObsPisCofins || null,
      productRefs: Array.isArray(row.productRefs) ? row.productRefs : [],
      defaultSupplier: row.defaultSupplier || null,
    });
  } catch (error) {
    return apiError(error, 'products/details');
  }
}
