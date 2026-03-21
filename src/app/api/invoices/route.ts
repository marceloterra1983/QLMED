import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, requireEditor, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import { markCompanyForSyncRecovery } from '@/lib/sync-recovery';
import { normalizeForSearch, flexMatchAll } from '@/lib/utils';
import { extractFirstCfop, getCfopTagByCode } from '@/lib/cfop';
import { ensureLocalXmlSyncNow } from '@/lib/local-xml-sync';

const invoiceQuerySchema = z.object({
  page: z.coerce.number().int().positive().max(10000).catch(1),
  limit: z.coerce.number().int().positive().max(200).catch(50),
  search: z.string().max(200).catch(''),
  type: z.enum(['NFE', 'CTE', 'NFSE', '']).catch(''),
  status: z.string().max(50).catch(''),
  direction: z.enum(['received', 'issued', '']).catch(''),
  sort: z.enum(['import', 'emission', 'number', 'sender', 'recipient', 'value', 'status', '']).catch(''),
  order: z.enum(['asc', 'desc']).catch('desc'),
  cfopTag: z.string().max(50).catch(''),
  dateFrom: z.string().max(10).catch(''),
  dateTo: z.string().max(10).catch(''),
});

const deleteInvoicesSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(500),
});

function decodeXmlEntities(input: string): string {
  return input
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function extractCteRemetenteName(xmlContent: string | null | undefined): string | null {
  if (!xmlContent) return null;

  const remBlock = xmlContent.match(/<rem\b[\s\S]*?<\/rem>/i)?.[0];
  const remName = remBlock?.match(/<xNome>([\s\S]*?)<\/xNome>/i)?.[1];
  if (remName) {
    const decodedRem = decodeXmlEntities(remName).replace(/\s+/g, ' ').trim();
    if (decodedRem) return decodedRem;
  }

  // Fallback solicitado: quando não houver remetente, usar o expedidor do XML.
  const expedBlock = xmlContent.match(/<exped\b[\s\S]*?<\/exped>/i)?.[0];
  const expedName = expedBlock?.match(/<xNome>([\s\S]*?)<\/xNome>/i)?.[1];
  if (!expedName) return null;
  const decodedExped = decodeXmlEntities(expedName).replace(/\s+/g, ' ').trim();
  return decodedExped || null;
}

function extractCteCnpjFromBlock(block: string | null | undefined): string | null {
  if (!block) return null;
  const cnpj = block.match(/<CNPJ>([\s\S]*?)<\/CNPJ>/i)?.[1]?.replace(/\D/g, '').trim();
  if (cnpj) return cnpj;
  const cpf = block.match(/<CPF>([\s\S]*?)<\/CPF>/i)?.[1]?.replace(/\D/g, '').trim();
  return cpf || null;
}

function extractCteRemetenteCnpj(xmlContent: string | null | undefined): string | null {
  if (!xmlContent) return null;
  const remBlock = xmlContent.match(/<rem\b[\s\S]*?<\/rem>/i)?.[0];
  const cnpj = extractCteCnpjFromBlock(remBlock);
  if (cnpj) return cnpj;
  const expedBlock = xmlContent.match(/<exped\b[\s\S]*?<\/exped>/i)?.[0];
  return extractCteCnpjFromBlock(expedBlock);
}

function extractCteRecebedorCnpj(xmlContent: string | null | undefined): string | null {
  if (!xmlContent) return null;
  const recebBlock = xmlContent.match(/<receb\b[\s\S]*?<\/receb>/i)?.[0];
  const cnpj = extractCteCnpjFromBlock(recebBlock);
  if (cnpj) return cnpj;
  const destBlock = xmlContent.match(/<dest\b[\s\S]*?<\/dest>/i)?.[0];
  return extractCteCnpjFromBlock(destBlock);
}

function extractCteRecebedorName(xmlContent: string | null | undefined): string | null {
  if (!xmlContent) return null;

  const recebBlock = xmlContent.match(/<receb\b[\s\S]*?<\/receb>/i)?.[0];
  const recebName = recebBlock?.match(/<xNome>([\s\S]*?)<\/xNome>/i)?.[1];
  if (recebName) {
    const decodedReceb = decodeXmlEntities(recebName).replace(/\s+/g, ' ').trim();
    if (decodedReceb) return decodedReceb;
  }

  // Fallback solicitado: quando não houver recebedor, usar o destinatário do XML.
  const destBlock = xmlContent.match(/<dest\b[\s\S]*?<\/dest>/i)?.[0];
  const destName = destBlock?.match(/<xNome>([\s\S]*?)<\/xNome>/i)?.[1];
  if (!destName) return null;
  const decodedDest = decodeXmlEntities(destName).replace(/\s+/g, ' ').trim();
  return decodedDest || null;
}

const MUNICIPALITY_CODE_TO_CITY: Record<string, string> = {
  '3106200': 'Belo Horizonte',
  '3518800': 'Guarulhos',
  '3547304': 'Santana de Parnaiba',
  '5002704': 'Campo Grande',
  '5003702': 'Dourados',
  '5103403': 'Cuiaba',
};

function normalizeCity(value: string | null | undefined): string | null {
  if (!value) return null;
  const decoded = decodeXmlEntities(value).replace(/\s+/g, ' ').trim();
  if (!decoded) return null;
  return decoded;
}

function mapMunicipalityCodeToCity(code: string | null | undefined): string | null {
  if (!code) return null;
  const digits = code.replace(/\D/g, '');
  if (digits.length !== 7) return null;
  return MUNICIPALITY_CODE_TO_CITY[digits] || null;
}

function extractNfseSenderCity(xmlContent: string | null | undefined): string | null {
  if (!xmlContent) return null;

  // Padrão nacional ADN costuma trazer cidade explícita em xLocEmi.
  const cityFromLoc = normalizeCity(xmlContent.match(/<xLocEmi>([\s\S]*?)<\/xLocEmi>/i)?.[1]);
  if (cityFromLoc) return cityFromLoc;

  // Schemas municipais/ABRASF podem trazer xMun no bloco do prestador/emitente.
  const emitBlock = xmlContent.match(/<emit\b[\s\S]*?<\/emit>/i)?.[0];
  const cityFromEmitXmun = normalizeCity(emitBlock?.match(/<xMun>([\s\S]*?)<\/xMun>/i)?.[1]);
  if (cityFromEmitXmun) return cityFromEmitXmun;

  // Fallback via código do município (IBGE) quando houver mapeamento conhecido.
  const cityCode =
    emitBlock?.match(/<cMun>(\d{7})<\/cMun>/i)?.[1]
    || xmlContent.match(/<cLocEmi>(\d{7})<\/cLocEmi>/i)?.[1]
    || xmlContent.match(/<CodigoMunicipio>(\d{7})<\/CodigoMunicipio>/i)?.[1]
    || null;

  return mapMunicipalityCodeToCity(cityCode);
}

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

    const params = invoiceQuerySchema.parse({
      page: searchParams.get('page') ?? undefined,
      limit: searchParams.get('limit') ?? undefined,
      search: (searchParams.get('search') || '').trim(),
      type: searchParams.get('type') ?? undefined,
      status: (searchParams.get('status') || '').trim(),
      direction: searchParams.get('direction') ?? undefined,
      sort: (searchParams.get('sort') || '').trim(),
      order: searchParams.get('order') ?? undefined,
      cfopTag: (searchParams.get('cfopTag') || '').trim(),
      dateFrom: searchParams.get('dateFrom') || '',
      dateTo: searchParams.get('dateTo') || '',
    });

    const { page, limit, search, type, status, direction, order, cfopTag } = params;
    const sort = params.sort || 'emission';
    const { dateFrom, dateTo } = params;

    if (direction === 'issued' && (type === '' || type === 'NFE')) {
      try {
        await ensureLocalXmlSyncNow();
      } catch (syncError) {
        console.error('[Invoices] Falha ao forçar sync local de XML:', syncError);
      }
    }

    const where: any = { companyId: company.id };

    if (type) where.type = type;
    if (status) where.status = status;
    if (direction) where.direction = direction;

    if (dateFrom || dateTo) {
      where.issueDate = {};
      if (dateFrom) where.issueDate.gte = new Date(dateFrom + 'T00:00:00.000Z');
      if (dateTo) where.issueDate.lte = new Date(dateTo + 'T23:59:59.999Z');
    }

    const sortMapping: Record<string, string> = {
      import: 'createdAt',
      emission: 'issueDate',
      number: 'number',
      sender: 'senderName',
      recipient: 'recipientName',
      value: 'totalValue',
      status: 'status',
    };

    const orderByField = sortMapping[sort] || 'issueDate';
    const orderByDir = order === 'asc' ? 'asc' : 'desc';

    const selectFields = {
      id: true,
      accessKey: true,
      type: true,
      direction: true,
      number: true,
      series: true,
      issueDate: true,
      senderCnpj: true,
      senderName: true,
      recipientCnpj: true,
      recipientName: true,
      totalValue: true,
      status: true,
      createdAt: true,
    };

    const attachCfopForInvoices = async <T extends { id: string }>(
      baseInvoices: T[]
    ): Promise<Array<T & {
      cfop: string | null;
      cteRemetenteName: string | null;
      cteRecebedorName: string | null;
      cteRemetenteCnpj: string | null;
      cteRecebedorCnpj: string | null;
      senderCity: string | null;
    }>> => {
      if (baseInvoices.length === 0) return [];
      const xmlById = await prisma.invoice.findMany({
        where: { companyId: company.id, id: { in: baseInvoices.map((invoice) => invoice.id) } },
        select: { id: true, xmlContent: true, type: true },
      });
      const cfopById = new Map(xmlById.map((entry) => [entry.id, extractFirstCfop(entry.xmlContent)]));
      const cteRemetenteById = new Map(
        xmlById.map((entry) => [
          entry.id,
          entry.type === 'CTE' ? extractCteRemetenteName(entry.xmlContent) : null,
        ])
      );
      const cteRecebedorById = new Map(
        xmlById.map((entry) => [
          entry.id,
          entry.type === 'CTE' ? extractCteRecebedorName(entry.xmlContent) : null,
        ])
      );
      const cteRemetenteCnpjById = new Map(
        xmlById.map((entry) => [
          entry.id,
          entry.type === 'CTE' ? extractCteRemetenteCnpj(entry.xmlContent) : null,
        ])
      );
      const cteRecebedorCnpjById = new Map(
        xmlById.map((entry) => [
          entry.id,
          entry.type === 'CTE' ? extractCteRecebedorCnpj(entry.xmlContent) : null,
        ])
      );
      const senderCityById = new Map(
        xmlById.map((entry) => [
          entry.id,
          entry.type === 'NFSE' ? extractNfseSenderCity(entry.xmlContent) : null,
        ])
      );

      return baseInvoices.map((invoice) => ({
        ...invoice,
        cfop: cfopById.get(invoice.id) || null,
        cteRemetenteName: cteRemetenteById.get(invoice.id) || null,
        cteRecebedorName: cteRecebedorById.get(invoice.id) || null,
        cteRemetenteCnpj: cteRemetenteCnpjById.get(invoice.id) || null,
        cteRecebedorCnpj: cteRecebedorCnpjById.get(invoice.id) || null,
        senderCity: senderCityById.get(invoice.id) || null,
      }));
    };

    if (search) {
      const searchWords = normalizeForSearch(search).split(/\s+/).filter(Boolean);

      const allInvoices = await prisma.invoice.findMany({
        where,
        select: selectFields,
        orderBy: { [orderByField]: orderByDir },
        take: 5000,
      });

      const cnpjsInPage = Array.from(new Set([
        ...allInvoices.map((inv) => inv.senderCnpj),
        ...allInvoices.map((inv) => inv.recipientCnpj),
      ].filter(Boolean) as string[]));
      const searchNicknames = cnpjsInPage.length > 0
        ? await prisma.contactNickname.findMany({
            where: { companyId: company.id, cnpj: { in: cnpjsInPage } },
            select: { cnpj: true, shortName: true },
          })
        : [];
      const searchNicknameMap = new Map(searchNicknames.map((n) => [n.cnpj, n.shortName]));

      const filtered = allInvoices.filter((inv) => {
        const fields = [
          inv.senderName || '',
          inv.recipientName || '',
          inv.accessKey || '',
          inv.number || '',
          inv.senderCnpj || '',
          inv.recipientCnpj || '',
          (inv.senderCnpj || '').replace(/\D/g, ''),
          (inv.recipientCnpj || '').replace(/\D/g, ''),
          searchNicknameMap.get(inv.senderCnpj || '') || '',
          searchNicknameMap.get(inv.recipientCnpj || '') || '',
        ];
        return flexMatchAll(fields, searchWords);
      });

      const invoicesWithCfop = await attachCfopForInvoices(filtered);
      const byCfopTag = cfopTag
        ? invoicesWithCfop.filter((inv) => getCfopTagByCode(inv.cfop) === cfopTag)
        : invoicesWithCfop;
      const total = byCfopTag.length;
      const paginated = byCfopTag.slice((page - 1) * limit, (page - 1) * limit + limit);

      return NextResponse.json({
        invoices: paginated,
        pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      });
    }

    if (cfopTag) {
      const baseInvoices = await prisma.invoice.findMany({
        where,
        select: selectFields,
        orderBy: { [orderByField]: orderByDir },
        take: 5000,
      });
      const invoicesWithCfop = await attachCfopForInvoices(baseInvoices);
      const filteredByTag = invoicesWithCfop.filter((inv) => getCfopTagByCode(inv.cfop) === cfopTag);
      const total = filteredByTag.length;
      const paginated = filteredByTag.slice((page - 1) * limit, (page - 1) * limit + limit);

      return NextResponse.json({
        invoices: paginated,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      });
    }

    const [invoices, total] = await Promise.all([
      prisma.invoice.findMany({
        where,
        select: selectFields,
        orderBy: { [orderByField]: orderByDir },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.invoice.count({ where }),
    ]);
    const invoicesWithCfop = await attachCfopForInvoices(invoices);

    return NextResponse.json({
      invoices: invoicesWithCfop,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching invoices:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    let userId: string;
    try {
      const auth = await requireEditor();
      userId = auth.userId;
    } catch (e: any) {
      if (e.message === 'FORBIDDEN') return forbiddenResponse();
      return unauthorizedResponse();
    }
    const company = await getOrCreateSingleCompany(userId);

    const body = await req.json();
    const parsed = deleteInvoicesSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'IDs inválidos', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }
    const { ids } = parsed.data;

    const invoicesToDelete = await prisma.invoice.findMany({
      where: { id: { in: ids }, companyId: company.id },
      select: { id: true, issueDate: true },
    });

    if (invoicesToDelete.length === 0) {
      return NextResponse.json({ deleted: 0 });
    }

    const earliestIssueDate = invoicesToDelete.reduce((earliest, current) => (
      current.issueDate < earliest ? current.issueDate : earliest
    ), invoicesToDelete[0].issueDate);

    const result = await prisma.invoice.deleteMany({
      where: { id: { in: invoicesToDelete.map((invoice) => invoice.id) }, companyId: company.id },
    });

    let syncRecoveryMarked = false;
    try {
      await markCompanyForSyncRecovery(company.id, earliestIssueDate);
      syncRecoveryMarked = true;
    } catch (syncRecoveryError) {
      console.error('Error marking sync recovery after delete:', syncRecoveryError);
    }

    return NextResponse.json({ deleted: result.count, syncRecoveryMarked });
  } catch (error) {
    console.error('Error deleting invoices:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
