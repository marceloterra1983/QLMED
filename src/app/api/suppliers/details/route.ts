import { NextResponse } from 'next/server';
import { requireAuth, unauthorizedResponse } from '@/lib/auth';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import { handleContactDetails } from '@/lib/contact-details-shared';

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
    const cnpj = searchParams.get('cnpj');
    const name = searchParams.get('name');
    const metaOnly = searchParams.get('metaOnly') === '1';

    return handleContactDetails(company, cnpj, name, metaOnly, 'supplier');
  } catch (error) {
    console.error('Error fetching supplier details:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
