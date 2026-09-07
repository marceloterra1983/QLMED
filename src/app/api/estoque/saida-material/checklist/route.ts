import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { requireEditor, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import { apiError, apiValidationError } from '@/lib/api-error';
import { saidaMaterialChecklistSchema } from '@/lib/schemas/estoque';
import prisma from '@/lib/prisma';
import {
  recordStockMovements,
  STOCK_LOCATION_CD,
  type StockMovementInput,
} from '@/lib/stock-ledger';

export async function POST(req: Request) {
  try {
    let userId: string;
    try {
      userId = (await requireEditor()).userId;
    } catch (e) {
      if (e instanceof Error && e.message === 'FORBIDDEN') return forbiddenResponse();
      return unauthorizedResponse();
    }
    const company = await getOrCreateSingleCompany(userId);
    const parsed = saidaMaterialChecklistSchema.safeParse(await req.json());
    if (!parsed.success) return apiValidationError(parsed.error);

    const body = parsed.data;
    if (body.mode === 'avulsa_movimento' && body.tab !== 'saida_avulsa') {
      return NextResponse.json(
        { error: 'Movimento SAIDA_AVULSA só é permitido na aba Saída Avulsa' },
        { status: 400 },
      );
    }

    const customerCnpj = body.customerCnpj
      ? body.customerCnpj.replace(/\D/g, '') || null
      : null;
    const kind = body.mode === 'avulsa_movimento' ? 'SAIDA_AVULSA' : 'CHECKLIST';

    const row = await prisma.stockExitChecklist.create({
      data: {
        companyId: company.id,
        tab: body.tab,
        customerCnpj,
        customerName: body.customerName?.trim() || null,
        items: body.items,
        kind,
        createdBy: userId,
      },
    });

    let movements = 0;
    if (body.mode === 'avulsa_movimento') {
      const now = new Date();
      const batch = randomUUID();
      const rows: StockMovementInput[] = body.items.map((item, idx) => ({
        companyId: company.id,
        productCodigo: item.productCodigo,
        productName: item.productName ?? null,
        lot: item.lot || '',
        lotExpiry: item.lotExpiry ?? null,
        quantity: item.quantity,
        direction: 'OUT',
        locationType: STOCK_LOCATION_CD,
        kind: 'SAIDA_AVULSA',
        reason: `Saída avulsa checklist ${row.id}`,
        createdBy: userId,
        occurredAt: now,
        idempotencyKey: `saida-avulsa:${row.id}:${idx}:${batch}`,
      }));
      movements = await recordStockMovements(rows);
    }

    return NextResponse.json({ checklist: row, movements }, { status: 201 });
  } catch (error) {
    return apiError(error, 'POST /api/estoque/saida-material/checklist');
  }
}
