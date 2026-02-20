import { PrismaClient } from '@prisma/client';
import { SefazClient } from './sefaz-client';
import { CertificateManager } from './certificate-manager';
import { NsdocsClient } from './nsdocs-client';
import { decrypt } from './crypto';

// Instância própria de Prisma para evitar import circular com prisma.ts
const prisma = new PrismaClient();

const CHECK_INTERVAL_MS = 60 * 1000; // Verifica a cada 60 segundos

const UF_TO_CODE: Record<string, string> = {
  AC: '12', AL: '27', AP: '16', AM: '13', BA: '29', CE: '23', DF: '53', ES: '32',
  GO: '52', MA: '21', MT: '51', MS: '50', MG: '31', PA: '15', PB: '25', PR: '41',
  PE: '26', PI: '22', RJ: '33', RN: '24', RS: '43', RO: '11', RR: '14', SC: '42',
  SP: '35', SE: '28', TO: '17',
};

function getUfCode(subject?: string | null): string {
  if (!subject) return '50';
  const uf = subject.match(/(?:^|,\s*)ST=([A-Z]{2})(?:,|$)/)?.[1];
  return (uf && UF_TO_CODE[uf]) ? UF_TO_CODE[uf] : '50';
}

let started = false;

export function startAutoSync() {
  if (started) return;
  started = true;

  console.log('[AutoSync] Scheduler iniciado - verificando a cada 60s');

  // Primeira verificação após 30s (tempo para o servidor aquecer)
  setTimeout(() => {
    checkAndSync();
    setInterval(checkAndSync, CHECK_INTERVAL_MS);
  }, 30_000);
}

async function checkAndSync() {
  try {
    const configs = await prisma.nsdocsConfig.findMany({
      where: { autoSync: true },
      include: {
        company: {
          include: {
            certificateConfig: true,
            nsdocsConfig: true,
          },
        },
      },
    });

    for (const config of configs) {
      const company = config.company;
      const intervalMs = config.syncInterval * 60 * 1000;
      const now = Date.now();

      // Não iniciar se já tem sync rodando
      const running = await prisma.syncLog.findFirst({
        where: { companyId: company.id, status: 'running' },
      });
      if (running) continue;

      // Verificar se já passou o intervalo desde a última sync concluída
      const lastSync = await prisma.syncLog.findFirst({
        where: { companyId: company.id, status: 'completed' },
        orderBy: { completedAt: 'desc' },
      });

      if (lastSync?.completedAt) {
        const elapsed = now - new Date(lastSync.completedAt).getTime();
        if (elapsed < intervalMs) continue;
      }

      console.log(`[AutoSync] Sincronizando: ${company.razaoSocial} (${company.cnpj})`);

      // Prioridade SEFAZ, fallback NSDocs
      if (company.certificateConfig) {
        await syncViaSefaz(company.id, company.cnpj, company.razaoSocial, company.certificateConfig);
      } else if (company.nsdocsConfig) {
        await syncViaNsdocs(company.id, company.cnpj, company.razaoSocial, company.nsdocsConfig);
      }
    }
  } catch (error) {
    console.error('[AutoSync] Erro no check:', error);
  }
}

async function syncViaSefaz(
  companyId: string,
  cnpj: string,
  razaoSocial: string,
  cert: {
    id: string;
    pfxData: Buffer;
    pfxPassword: string;
    lastNsu: string;
    environment: string;
    subject: string | null;
  },
) {
  const syncLog = await prisma.syncLog.create({
    data: { companyId, syncMethod: 'sefaz', status: 'running' },
  });

  let ultNSU = cert.lastNsu || '0';

  try {
    const pfxPassword = decrypt(cert.pfxPassword);
    const { key, cert: certPem } = CertificateManager.extractPems(cert.pfxData, pfxPassword);

    const sefaz = new SefazClient(
      certPem,
      key,
      cnpj,
      cert.environment === 'production',
      getUfCode(cert.subject),
    );

    let temMais = true;
    let totalNovos = 0;
    let totalAtualizados = 0;
    let loopCount = 0;

    while (temMais && loopCount < 50) {
      loopCount++;
      const nsuAntes = ultNSU;

      const response = await sefaz.buscarNovosDocumentos(ultNSU);

      if (response.status === 'error') {
        if (response.cStat === '656') {
          throw new Error('Bloqueio SEFAZ (656): Excesso de consultas. Aguarde 1h.');
        }
        throw new Error(`Erro SEFAZ: ${response.xMotivo} (cStat: ${response.cStat})`);
      }

      ultNSU = response.ultNSU || ultNSU;

      if (response.status === 'empty') break;
      if (response.docs.length === 0 && ultNSU === nsuAntes) break;

      for (const doc of response.docs) {
        if (doc.tipo !== 'nfe' || !doc.chave || doc.chave.length < 44) continue;

        const exists = await prisma.invoice.findUnique({ where: { accessKey: doc.chave } });

        if (!exists) {
          const valMatch = doc.xml.match(/<vNF>([\d.,]+)<\/vNF>/);
          const valRaw = valMatch?.[1] || '';
          const valNorm = valRaw.includes(',') ? valRaw.replace(/\./g, '').replace(',', '.') : valRaw;
          const valParsed = valNorm ? parseFloat(valNorm) : 0;
          const totalValue = Number.isFinite(valParsed) ? valParsed : 0;

          const dateMatch = doc.xml.match(/<(dhEmi|dEmi)>([^<]+)<\/\1>/);
          const issueDate = dateMatch ? new Date(dateMatch[2]) : new Date();

          const senderCnpj = doc.xml.match(/<emit[\s\S]*?<CNPJ>(\d+)<\/CNPJ>/)?.[1] || '00000000000000';
          const companyCnpj = cnpj.replace(/\D/g, '');
          const direction = senderCnpj === companyCnpj ? 'issued' : 'received';

          await prisma.invoice.create({
            data: {
              companyId,
              accessKey: doc.chave,
              type: 'NFE',
              direction,
              number: doc.chave.substring(25, 34),
              series: doc.chave.substring(22, 25),
              issueDate,
              senderCnpj,
              senderName: doc.emitente,
              recipientCnpj: cnpj,
              recipientName: razaoSocial,
              totalValue,
              status: 'received',
              xmlContent: doc.xml,
            },
          });
          totalNovos++;
        } else {
          totalAtualizados++;
        }
      }

      const ultBig = BigInt(response.ultNSU || '0');
      const maxBig = BigInt(response.maxNSU || '0');
      if (ultBig >= maxBig) temMais = false;
    }

    await prisma.certificateConfig.update({
      where: { id: cert.id },
      data: { lastNsu: ultNSU, lastSyncAt: new Date() },
    });

    await prisma.syncLog.update({
      where: { id: syncLog.id },
      data: { status: 'completed', newDocs: totalNovos, updatedDocs: totalAtualizados, completedAt: new Date() },
    });

    console.log(`[AutoSync] SEFAZ OK: ${razaoSocial} - ${totalNovos} novos, ${totalAtualizados} atualizados`);
  } catch (err: any) {
    console.error(`[AutoSync] Erro SEFAZ ${razaoSocial}:`, err.message);
    try {
      await prisma.certificateConfig.update({ where: { id: cert.id }, data: { lastNsu: ultNSU } });
    } catch {}
    await prisma.syncLog.update({
      where: { id: syncLog.id },
      data: { status: 'error', errorMessage: err.message, completedAt: new Date() },
    });
  }
}

async function syncViaNsdocs(
  companyId: string,
  cnpj: string,
  razaoSocial: string,
  nsdocsConfig: { id: string; apiToken: string },
) {
  const syncLog = await prisma.syncLog.create({
    data: { companyId, syncMethod: 'nsdocs', status: 'running' },
  });

  try {
    const client = new NsdocsClient(nsdocsConfig.apiToken);
    await client.syncCompleto(cnpj);

    await prisma.syncLog.update({
      where: { id: syncLog.id },
      data: { status: 'completed', completedAt: new Date() },
    });

    console.log(`[AutoSync] NSDocs OK: ${razaoSocial}`);
  } catch (err: any) {
    console.error(`[AutoSync] Erro NSDocs ${razaoSocial}:`, err.message);
    await prisma.syncLog.update({
      where: { id: syncLog.id },
      data: { status: 'error', errorMessage: err.message, completedAt: new Date() },
    });
  }
}
