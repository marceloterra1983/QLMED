import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const company = await prisma.company.findFirst({
    include: { certificateConfig: true }
  });

  if (!company) {
    console.log('Nenhuma empresa encontrada.');
    return;
  }

  console.log('Empresa:', company.razaoSocial, company.cnpj);
  console.log('Config Atual:', company.certificateConfig);

  if (company.certificateConfig) {
    // Resetar para 0 para forçar download de tudo
    // Ou para um NSU específico se soubermos
    // Para teste seguro, vamos resetar para 0
    await prisma.certificateConfig.update({
      where: { id: company.certificateConfig.id },
      data: { lastNsu: '0' }
    });
    console.log('NSU resetado para 0 com sucesso!');
  } else {
    console.log('Sem configuração de certificado.');
  }
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
