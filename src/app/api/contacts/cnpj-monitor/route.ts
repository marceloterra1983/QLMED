import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, unauthorizedResponse } from '@/lib/auth';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import { runBatchCnpjCheck, getRecentCnpjChanges } from '@/lib/cnpj-monitor';

export async function POST(req: NextRequest) {
  let userId: string;
  try {
    userId = await requireAuth();
  } catch {
    return unauthorizedResponse();
  }

  const company = await getOrCreateSingleCompany(userId);

  let batchSize = 10;
  try {
    const body = await req.json();
    if (body.batchSize) batchSize = Math.min(Number(body.batchSize), 50);
  } catch { /* use defaults */ }

  const result = await runBatchCnpjCheck(company.id, batchSize);
  return NextResponse.json({ ok: true, ...result });
}

export async function GET(req: Request) {
  let userId: string;
  try {
    userId = await requireAuth();
  } catch {
    return unauthorizedResponse();
  }

  const company = await getOrCreateSingleCompany(userId);
  const changes = await getRecentCnpjChanges(company.id);
  return NextResponse.json({ changes });
}
