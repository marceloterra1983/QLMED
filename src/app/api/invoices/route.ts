import { NextResponse } from 'next/server';
import { requireAuth, requireEditor, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import { markCompanyForSyncRecovery } from '@/lib/sync-recovery';
import { normalizeForSearch, flexMatchAll } from '@/lib/utils';
import { extractFirstCfop, getCfopTagByCode } from '@/lib/cfop';
import { ensureLocalXmlSyncNow } from '@/lib/local-xml-sync';

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

    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const search = (searchParams.get('search') || '').trim();
    const type = searchParams.get('type') || '';
    const status = searchParams.get('status') || '';
    const order = searchParams.get('order') || 'desc';
    const cfopTag = (searchParams.get('cfopTag') || '').trim();

    const direction = searchParams.get('direction') || '';
    const requestedSort = (searchParams.get('sort') || '').trim();
    const defaultSort = 'emission';
    const sort = requestedSort || defaultSort;
    const dateFrom = searchParams.get('dateFrom') || '';
    const dateTo = searchParams.get('dateTo') || '';

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
    ): Promise<Array<T & { cfop: string | null; cteRemetenteName: string | null; cteRecebedorName: string | null; cteRemetenteCnpj: string | null; cteRecebedorCnpj: string | null }>> => {
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

      return baseInvoices.map((invoice) => ({
        ...invoice,
        cfop: cfopById.get(invoice.id) || null,
        cteRemetenteName: cteRemetenteById.get(invoice.id) || null,
        cteRecebedorName: cteRecebedorById.get(invoice.id) || null,
        cteRemetenteCnpj: cteRemetenteCnpjById.get(invoice.id) || null,
        cteRecebedorCnpj: cteRecebedorCnpjById.get(invoice.id) || null,
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
    const { ids } = body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'IDs não fornecidos' }, { status: 400 });
    }

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
