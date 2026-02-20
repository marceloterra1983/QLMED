import prisma from '@/lib/prisma';

const DEFAULT_COMPANY_CNPJ = (process.env.SINGLE_COMPANY_CNPJ || '07832309000197').replace(/\D/g, '');
const DEFAULT_COMPANY_RAZAO_SOCIAL =
  process.env.SINGLE_COMPANY_RAZAO_SOCIAL || 'QL MED MATERIAIS HOSPITALARES LTDA';
const DEFAULT_COMPANY_NOME_FANTASIA = process.env.SINGLE_COMPANY_NOME_FANTASIA || 'QLMED';

export async function getOrCreateSingleCompany(userId: string) {
  // Single-company mode: always look up by the fixed CNPJ first.
  // This ensures all users share the same company record regardless of who created it.
  const existing = await prisma.company.findUnique({
    where: { cnpj: DEFAULT_COMPANY_CNPJ },
  });

  if (existing) {
    return existing;
  }

  return prisma.company.create({
    data: {
      userId,
      cnpj: DEFAULT_COMPANY_CNPJ,
      razaoSocial: DEFAULT_COMPANY_RAZAO_SOCIAL,
      nomeFantasia: DEFAULT_COMPANY_NOME_FANTASIA,
    },
  });
}
