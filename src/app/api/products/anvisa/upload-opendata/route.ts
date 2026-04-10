import { NextResponse } from 'next/server';
import { requireAuth, unauthorizedResponse } from '@/lib/auth';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import { ensureProductRegistryTable, updateRegistryAnvisaData } from '@/lib/product-registry-store';
import prisma from '@/lib/prisma';
import { apiValidationError } from '@/lib/api-error';
import { anvisaUploadOpendataSchema } from '@/lib/schemas/product';

interface OpenDataItem {
  registration: string;
  nomeProduto: string | null;
  nomeEmpresa: string | null;
  processo: string | null;
  situacao: string | null;
  vencimento: string | null;
  classeRisco: string | null;
  nomeFabricante: string | null;
  paisFabricante: string | null;
}

export async function POST(req: Request) {
  let userId: string;
  try {
    userId = await requireAuth();
  } catch {
    return unauthorizedResponse();
  }

  const company = await getOrCreateSingleCompany(userId);
  await ensureProductRegistryTable();

  const body = await req.json().catch(() => null);
  const parsed = anvisaUploadOpendataSchema.safeParse(body);
  if (!parsed.success) return apiValidationError(parsed.error);

  const items: OpenDataItem[] = parsed.data.items as OpenDataItem[];

  // Build lookup map: registration code (padded to 11 digits) → data
  const byCode = new Map<string, OpenDataItem>();
  for (const item of items) {
    const raw = (item.registration || '').replace(/\D/g, '');
    if (!raw) continue;
    const code = raw.padStart(11, '0');
    if (code.length === 11 && !byCode.has(code)) {
      byCode.set(code, item);
    }
  }

  if (byCode.size === 0) {
    return NextResponse.json({ error: 'Nenhum código de registro válido encontrado' }, { status: 400 });
  }

  // Fetch all registry rows for this company that have anvisa codes
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT id, anvisa_code FROM product_registry
     WHERE company_id = $1 AND anvisa_code IS NOT NULL AND anvisa_code != ''`,
    company.id,
  );

  let updated = 0, notFound = 0;

  for (const row of rows) {
    const code = (row.anvisa_code || '').replace(/\D/g, '').padStart(11, '0');
    const match = byCode.get(code);
    if (!match) {
      notFound++;
      continue;
    }

    await updateRegistryAnvisaData(row.id, {
      anvisaMatchedProductName: match.nomeProduto ?? null,
      anvisaHolder: match.nomeEmpresa ?? null,
      anvisaProcess: match.processo ?? null,
      anvisaStatus: match.situacao ?? null,
      anvisaExpiration: match.vencimento ?? null,
      anvisaRiskClass: match.classeRisco ?? null,
      anvisaManufacturer: match.nomeFabricante ?? null,
      anvisaManufacturerCountry: match.paisFabricante ?? null,
      anvisaSyncedAt: new Date(),
    });
    updated++;
  }

  return NextResponse.json({
    ok: true,
    updated,
    notFound,
    total: rows.length,
    codesInFile: byCode.size,
  });
}
