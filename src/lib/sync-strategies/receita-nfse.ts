import { syncReceitaNfseByNsu } from '../receita-nfse-sync';
import { prisma } from '../prisma';
import { createLogger } from '@/lib/logger';

const log = createLogger('auto-sync');

export interface ReceitaNfseSyncConfig {
  receitaConfig: {
    id: string;
    apiToken: string | null;
    lastNsu: string;
    cnpjConsulta: string | null;
    environment: string;
    baseUrl: string | null;
  };
  certificateConfig: {
    pfxData: Buffer | Uint8Array;
    pfxPassword: string;
  };
}

export async function syncViaReceitaNfse(
  companyId: string,
  cnpj: string,
  razaoSocial: string,
  receitaConfig: {
    id: string;
    apiToken: string | null;
    lastNsu: string;
    cnpjConsulta: string | null;
    environment: string;
    baseUrl: string | null;
  },
  certificateConfig: {
    pfxData: Buffer | Uint8Array;
    pfxPassword: string;
  },
  existingSyncLogId?: string,
) {
  const syncLog = existingSyncLogId
    ? { id: existingSyncLogId }
    : await prisma.syncLog.create({
        data: { companyId, syncMethod: 'receita_nfse', status: 'running' },
      });

  try {
    const result = await syncReceitaNfseByNsu({
      prisma,
      companyId,
      companyCnpj: cnpj,
      config: {
        id: receitaConfig.id,
        apiToken: receitaConfig.apiToken,
        lastNsu: receitaConfig.lastNsu,
        cnpjConsulta: receitaConfig.cnpjConsulta,
        environment: receitaConfig.environment,
        baseUrl: receitaConfig.baseUrl,
      },
      certificate: {
        pfxData: certificateConfig.pfxData,
        pfxPassword: certificateConfig.pfxPassword,
      },
    });

    const rateLimitMessage = result.rateLimited
      ? 'Receita NFS-e limitou a consulta (HTTP 429). Tente novamente em alguns minutos.'
      : null;
    const hasImportedDocs = result.importedXmlCount > 0;
    const finalStatus = result.rateLimited && !hasImportedDocs ? 'error' : 'completed';

    await prisma.receitaNfseConfig.update({
      where: { id: receitaConfig.id },
      data: {
        lastNsu: result.lastNsu,
        lastSyncAt: new Date(),
      },
    });

    await prisma.syncLog.update({
      where: { id: syncLog.id },
      data: {
        status: finalStatus,
        newDocs: result.newDocs,
        updatedDocs: result.updatedDocs,
        errorMessage: rateLimitMessage,
        completedAt: new Date(),
      },
    });

    log.info({ company: razaoSocial, newDocs: result.newDocs, updatedDocs: result.updatedDocs, scannedNsus: result.scannedNsuCount }, 'Receita NFS-e sync completed');
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    log.error({ err, company: razaoSocial }, 'Erro Receita NFS-e');
    try {
      await prisma.syncLog.update({
        where: { id: syncLog.id },
        data: { status: 'error', errorMessage: message, completedAt: new Date() },
      });
    } catch (logErr) {
      log.error({ err: logErr, syncLogId: syncLog.id }, 'CRITICAL: Failed to update syncLog to error');
    }
  }
}

