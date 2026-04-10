import { NextResponse } from 'next/server';
import { requireAuth, requireEditor, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import { normalizeForSearch, flexMatchAll } from '@/lib/utils';
import { ensureStockEntryTable, getStockEntriesByInvoiceIds, getNfePendencyCounts } from '@/lib/stock-entry-store';
import { registerInvoiceEntry, LotOverride } from '@/lib/register-entry';
import { apiError, apiValidationError } from '@/lib/api-error';
import { createLogger } from '@/lib/logger';
import { entradaNfeSchema } from '@/lib/schemas/estoque';

const log = createLogger('estoque/entrada-nfe');

export async function GET(req: Request) {
  try {
    let userId: string;
    try {
      userId = await requireAuth();
    } catch {
      return unauthorizedResponse();
    }
    const company = await getOrCreateSingleCompany(userId);
    await ensureStockEntryTable();

    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') || '1', 10) || 1;
    const limit = parseInt(searchParams.get('limit') || '50', 10) || 50;
    const search = (searchParams.get('search') || '').trim();
    const dateFrom = searchParams.get('dateFrom') || '';
    const dateTo = searchParams.get('dateTo') || '';
    const statusFilter = searchParams.get('status') || '';
    const sort = searchParams.get('sort') || 'emission';
    const order = searchParams.get('order') || 'desc';

    // Query NF-e received invoices
    const where: any = {
      companyId: company.id,
      type: 'NFE',
      direction: 'received',
    };

    if (dateFrom || dateTo) {
      where.issueDate = {};
      if (dateFrom) where.issueDate.gte = new Date(dateFrom + 'T00:00:00.000Z');
      if (dateTo) where.issueDate.lte = new Date(dateTo + 'T23:59:59.999Z');
    }

    const sortMapping: Record<string, string> = {
      emission: 'issueDate',
      number: 'number',
      sender: 'senderName',
      value: 'totalValue',
    };
    const orderByField = sortMapping[sort] || 'issueDate';
    const orderByDir = order === 'asc' ? 'asc' : 'desc';

    const selectFields = {
      id: true,
      number: true,
      issueDate: true,
      senderCnpj: true,
      senderName: true,
      totalValue: true,
    };

    let invoices = await prisma.invoice.findMany({
      where,
      select: selectFields,
      orderBy: { [orderByField]: orderByDir },
      take: 5000,
    });

    // Text search
    if (search) {
      const searchWords = normalizeForSearch(search).split(/\s+/).filter(Boolean);
      invoices = invoices.filter((inv) => {
        const fields = [
          inv.senderName || '',
          inv.number || '',
          inv.senderCnpj || '',
          (inv.senderCnpj || '').replace(/\D/g, ''),
        ];
        return flexMatchAll(fields, searchWords);
      });
    }

    // Get stock entry status for all invoices
    const invoiceIds = invoices.map((inv) => inv.id);
    const stockEntries = await getStockEntriesByInvoiceIds(company.id, invoiceIds);

    // Get pendency counts for invoices that have entries
    const registeredInvoiceIds = invoiceIds.filter((id) => stockEntries.has(id));
    const pendencyCounts = await getNfePendencyCounts(company.id, registeredInvoiceIds);

    // Merge stock entry data with invoices
    let results = invoices.map((inv) => {
      const entry = stockEntries.get(inv.id);
      const pendency = pendencyCounts.get(inv.id);
      return {
        id: inv.id,
        number: inv.number,
        issueDate: inv.issueDate,
        supplierName: inv.senderName,
        supplierCnpj: inv.senderCnpj,
        totalValue: Number(inv.totalValue),
        entryStatus: entry?.status ?? 'pending',
        totalItems: entry?.totalItems ?? null,
        matchedItems: entry?.matchedItems ?? null,
        registeredAt: entry?.registeredAt ?? null,
        unmatchedCount: pendency?.unmatchedCount ?? null,
        missingLotCount: pendency?.missingLotCount ?? null,
      };
    });

    // Filter by stock entry status
    if (statusFilter) {
      results = results.filter((r) => r.entryStatus === statusFilter);
    }

    const total = results.length;
    const paginated = results.slice((page - 1) * limit, (page - 1) * limit + limit);

    // Compute stats
    const pendingCount = results.filter((r) => r.entryStatus === 'pending').length;
    const partialCount = results.filter((r) => r.entryStatus === 'partial').length;
    const registeredCount = results.filter((r) => r.entryStatus === 'registered').length;

    return NextResponse.json({
      invoices: paginated,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      stats: { pending: pendingCount, partial: partialCount, registered: registeredCount },
    });
  } catch (error) {
    return apiError(error, 'estoque/entrada-nfe');
  }
}

export async function POST(req: Request) {
  try {
    let userId: string;
    try {
      const auth = await requireEditor();
      userId = auth.userId;
    } catch (e: unknown) {
      if (e instanceof Error && e.message === 'FORBIDDEN') return forbiddenResponse();
      return unauthorizedResponse();
    }
    const company = await getOrCreateSingleCompany(userId);

    const body = await req.json();
    const validated = entradaNfeSchema.safeParse(body);
    if (!validated.success) return apiValidationError(validated.error);

    const { invoiceId, lotOverrides: lotOverridesRaw } = body;

    // Build lotOverrides Map from request body if provided
    // Expected format: { [itemNumber]: [{ lot, expiry, quantity }] }
    let lotOverrides: Map<number, LotOverride[]> | undefined;
    if (lotOverridesRaw && typeof lotOverridesRaw === 'object') {
      lotOverrides = new Map<number, LotOverride[]>();
      for (const [key, value] of Object.entries(lotOverridesRaw)) {
        const itemNum = Number(key);
        if (!isNaN(itemNum) && Array.isArray(value)) {
          const validated: LotOverride[] = [];
          for (const entry of value) {
            if (typeof entry !== 'object' || entry === null) continue;
            const lot = typeof entry.lot === 'string' ? entry.lot : '';
            const expiry = typeof entry.expiry === 'string' ? entry.expiry : null;
            const quantity = typeof entry.quantity === 'number' ? entry.quantity : null;
            validated.push({ lot, expiry, quantity });
          }
          if (validated.length > 0) lotOverrides.set(itemNum, validated);
        }
      }
    }

    const result = await registerInvoiceEntry(company.id, invoiceId, userId, lotOverrides);
    if (!result) {
      return NextResponse.json({ error: 'Nota não encontrada ou sem XML' }, { status: 404 });
    }

    return NextResponse.json({ entry: { id: result.entryId }, totalItems: result.totalItems, matchedItems: result.matchedItems });
  } catch (error) {
    return apiError(error, 'estoque/entrada-nfe');
  }
}
