import prisma from '@/lib/prisma';

const DEFAULT_COMPANY_CNPJ = (process.env.SINGLE_COMPANY_CNPJ || '07832309000197').replace(/\D/g, '');
const DEFAULT_COMPANY_RAZAO_SOCIAL =
  process.env.SINGLE_COMPANY_RAZAO_SOCIAL || 'QL MED MATERIAIS HOSPITALARES LTDA';
const DEFAULT_COMPANY_NOME_FANTASIA = process.env.SINGLE_COMPANY_NOME_FANTASIA || 'QLMED';

export async function getOrCreateSingleCompany(userId: string) {
  // Single-company mode: find the user's company or the shared company they belong to.
  const existing = await prisma.company.findFirst({
    where: { userId },
    orderBy: { createdAt: 'asc' },
  });

  if (existing) {
    return existing;
  }

  return prisma.company.upsert({
    where: { cnpj: DEFAULT_COMPANY_CNPJ },
    update: {},
    create: {
      userId,
      cnpj: DEFAULT_COMPANY_CNPJ,
      razaoSocial: DEFAULT_COMPANY_RAZAO_SOCIAL,
      nomeFantasia: DEFAULT_COMPANY_NOME_FANTASIA,
    },
  });
}
