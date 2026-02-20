import prisma from '@/lib/prisma';

const DEFAULT_COMPANY_CNPJ = (process.env.SINGLE_COMPANY_CNPJ || '07832309000197').replace(/\D/g, '');
const DEFAULT_COMPANY_RAZAO_SOCIAL =
  process.env.SINGLE_COMPANY_RAZAO_SOCIAL || 'QL MED MATERIAIS HOSPITALARES LTDA';
const DEFAULT_COMPANY_NOME_FANTASIA = process.env.SINGLE_COMPANY_NOME_FANTASIA || 'QLMED';

export async function getOrCreateSingleCompany(userId: string) {
  // Single-company mode: always operate with the first company in the system.
  const existing = await prisma.company.findFirst({
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
