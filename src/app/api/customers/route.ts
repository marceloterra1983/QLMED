import { NextResponse } from 'next/server';
import { requireAuth, unauthorizedResponse } from '@/lib/auth';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import { handleContactList } from '@/lib/contact-shared';

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
    return handleContactList(company, 'customer', searchParams);
  } catch (error) {
    console.error('Error fetching customers:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
