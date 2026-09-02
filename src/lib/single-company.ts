import prisma from '@/lib/prisma';

const DEFAULT_COMPANY_CNPJ = (process.env.SINGLE_COMPANY_CNPJ || '07832309000197').replace(/\D/g, '');
const DEFAULT_COMPANY_RAZAO_SOCIAL =
  process.env.SINGLE_COMPANY_RAZAO_SOCIAL || 'QL MED MATERIAIS HOSPITALARES LTDA';
const DEFAULT_COMPANY_NOME_FANTASIA = process.env.SINGLE_COMPANY_NOME_FANTASIA || 'QLMED';

export async function getSingleCompany() {
  return prisma.company.findUnique({
    where: { cnpj: DEFAULT_COMPANY_CNPJ },
  });
}

export async function getOrCreateSingleCompany(userId: string) {
  // Single-company mode: todos partilham o registo do CNPJ fixo, seja quem for
  // que o tenha criado. O upsert é atómico no unique: dois pedidos concorrentes
  // num banco vazio (a primeira carga do painel dispara vários em paralelo)
  // já não colidem em `Company_cnpj_key` — o find-depois-create colidia.
  // `update: {}` de propósito: o registo existente não muda de dono.
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
