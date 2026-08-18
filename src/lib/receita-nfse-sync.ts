import { CertificateManager } from '@/lib/certificate-manager';
import { decrypt } from '@/lib/crypto';
import { resolveInvoiceDirection } from '@/lib/invoice-direction';
import { parseInvoiceXml } from '@/lib/parse-invoice-xml';
import { extractFirstCfop } from '@/lib/cfop';
import { ReceitaNfseClient, incrementNsu, normalizeNsu } from '@/lib/receita-nfse-client';
import { saveXmlToFile } from '@/lib/xml-file-store';
import { createLogger } from '@/lib/logger';
import { upsertInvoiceWithOutbox } from '@/lib/notification-outbox';
import { prisma } from '@/lib/prisma';
import { createSyncLogIfIdle } from '@/lib/postgres-advisory-lock';

const log = createLogger('receita-nfse-sync');

const DEFAULT_MAX_STEPS = 200;
const DEFAULT_EMPTY_LIMIT = 2;
// Intervalo entre consultas consecutivas à DistribuiçãoDFe do ADN no mesmo run.
// O ADN devolve HTTP 429 ("limitou a consulta") quando as consultas vêm em rajada
// (mesma causa do 656 no SEFAZ). Espaçar evita o 429 espúrio. Configurável por env.
const RECEITA_NFSE_QUERY_DELAY_MS = Math.max(0, Number(process.env.RECEITA_NFSE_QUERY_DELAY_MS) || 2000);

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function getReceitaNfseBaseUrl(environment?: string | null, explicitBaseUrl?: string | null): string {
  const custom = (explicitBaseUrl || '').trim();
  if (custom) return custom.replace(/\/+$/, '');

  const env = (environment || 'production').toLowerCase();
  if (env === 'production-restricted') {
    return 'https://adn.producaorestrita.nfse.gov.br/contribuintes';
  }

  return 'https://adn.nfse.gov.br/contribuintes';
}

function inferNfseStatus(xmlContent: string): 'received' | 'rejected' {
  const normalized = xmlContent
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();

  if (
    normalized.includes('CANCEL') ||
    normalized.includes('SUBSTITU')
  ) {
    return 'rejected';
  }

  return 'received';
}

function maxNsu(a: string, b: string): string {
  const na = Number(normalizeNsu(a));
  const nb = Number(normalizeNsu(b));
  if (!Number.isFinite(na)) return normalizeNsu(b);
  if (!Number.isFinite(nb)) return normalizeNsu(a);
  return na >= nb ? normalizeNsu(a) : normalizeNsu(b);
}

interface ReceitaNfseCertificateInput {
  pfxData: Buffer | Uint8Array;
  pfxPassword: string;
}

interface ReceitaNfseConfigInput {
  id: string;
  apiToken: string | null;
  lastNsu: string | null;
  cnpjConsulta: string | null;
  environment: string | null;
  baseUrl: string | null;
}

interface ReceitaNfsePrisma {
  invoice: {
    upsert: (args: Parameters<import('@prisma/client').PrismaClient['invoice']['upsert']>[0]) => Promise<{ createdAt: Date; updatedAt: Date; id: string }>;
  };
}

export interface ReceitaNfseSyncOptions {
  prisma: ReceitaNfsePrisma;
  companyId: string;
  companyCnpj: string;
  config: ReceitaNfseConfigInput;
  certificate: ReceitaNfseCertificateInput;
  maxSteps?: number;
  maxEmptySteps?: number;
}

export interface ReceitaNfseSyncResult {
  newDocs: number;
  updatedDocs: number;
  lastNsu: string;
  scannedNsuCount: number;
  importedXmlCount: number;
  rateLimited?: boolean;
}

export async function syncReceitaNfseByNsu(options: ReceitaNfseSyncOptions): Promise<ReceitaNfseSyncResult> {
  const {
    companyId,
    companyCnpj,
    config,
    certificate,
    maxSteps = DEFAULT_MAX_STEPS,
    maxEmptySteps = DEFAULT_EMPTY_LIMIT,
  } = options;

  const { cert, key } = CertificateManager.extractPems(
    certificate.pfxData,
    decrypt(certificate.pfxPassword),
  );

  const apiToken = config.apiToken ? decrypt(config.apiToken) : null;
  const baseUrl = getReceitaNfseBaseUrl(config.environment, config.baseUrl);
  const cnpjConsulta = (config.cnpjConsulta || companyCnpj || '').replace(/\D/g, '') || null;

  const client = new ReceitaNfseClient({
    baseUrl,
    apiToken,
    certPem: cert,
    keyPem: key,
    rejectUnauthorized: process.env.RECEITA_NFSE_VERIFY_SSL !== 'false',
  });

  let newDocs = 0;
  let updatedDocs = 0;
  let importedXmlCount = 0;
  let scannedNsuCount = 0;
  let emptyHits = 0;
  let lastNsu = normalizeNsu(config.lastNsu);
  let rateLimited = false;

  for (let i = 0; i < maxSteps; i++) {
    // Espaça consultas consecutivas (a partir da 2ª) — rajada disparava o 429.
    if (i > 0 && RECEITA_NFSE_QUERY_DELAY_MS > 0) {
      await sleep(RECEITA_NFSE_QUERY_DELAY_MS);
    }
    const targetNsu = incrementNsu(lastNsu);
    const response = await client.fetchDfeByNsu(targetNsu, cnpjConsulta);

    if (response.statusCode === 401 || response.statusCode === 403 || response.statusCode === 496) {
      throw new Error('Receita NFS-e: autenticação inválida (certificado/token/permissão).');
    }
    if (response.statusCode === 429) {
      rateLimited = true;
      break;
    }
    if (response.statusCode >= 500) {
      throw new Error(`Receita NFS-e: falha HTTP ${response.statusCode} ao consultar NSU ${targetNsu}.`);
    }
    if (response.statusCode >= 400 && response.statusCode !== 404) {
      throw new Error(`Receita NFS-e: resposta HTTP ${response.statusCode} ao consultar NSU ${targetNsu}.`);
    }

    // Corpo não-fiscal (não-JSON e sem DF-e): sinalizado pelo próprio fetch, onde o
    // parse realmente falha — robusto a qualquer forma de rawBody no resultado.
    if (response.parseFailed) {
      throw new Error(
        `Receita NFS-e: resposta não-fiscal ao consultar NSU ${targetNsu} ` +
          `(não-JSON/sem DF-e — provável página de erro do ADN). Verifique certificado/conectividade.`,
      );
    }

    // Defesa adicional: content-type HTML ou corpo iniciando com tag HTML.
    const looksHtml =
      /text\/html/i.test(response.contentType || '') ||
      /^\s*<(?:!doctype|html)\b/i.test(response.rawBody || '');
    if (looksHtml) {
      throw new Error(
        `Receita NFS-e: resposta HTML inesperada ao consultar NSU ${targetNsu} ` +
          `(endpoint ADN devolveu página de erro, não DF-e). Verifique certificado/conectividade.`,
      );
    }

    scannedNsuCount++;

    if (response.isEmpty) {
      emptyHits++;
      if (emptyHits >= maxEmptySteps) break;
      continue;
    }

    emptyHits = 0;
    // Avança checkpoint apenas quando houve retorno com conteúdo.
    lastNsu = targetNsu;
    for (const hinted of response.nsuHints) {
      lastNsu = maxNsu(lastNsu, hinted);
    }

    for (const xmlContent of response.documents) {
      const parsed = await parseInvoiceXml(xmlContent);
      if (!parsed || parsed.type !== 'NFSE' || !parsed.accessKey) continue;

      const direction = resolveInvoiceDirection(companyCnpj, parsed.senderCnpj, parsed.accessKey);
      const cfop = extractFirstCfop(xmlContent);

      const { isNewInvoice } = await upsertInvoiceWithOutbox({
        where: { accessKey: parsed.accessKey },
        update: {
          type: parsed.type,
          direction,
          number: parsed.number,
          series: parsed.series,
          issueDate: parsed.issueDate,
          senderCnpj: parsed.senderCnpj,
          senderName: parsed.senderName,
          recipientCnpj: parsed.recipientCnpj,
          recipientName: parsed.recipientName,
          totalValue: parsed.totalValue,
          status: inferNfseStatus(xmlContent),
          cfop,
          xmlContent,
        },
        create: {
          companyId,
          accessKey: parsed.accessKey,
          type: parsed.type,
          direction,
          number: parsed.number,
          series: parsed.series,
          issueDate: parsed.issueDate,
          senderCnpj: parsed.senderCnpj,
          senderName: parsed.senderName,
          recipientCnpj: parsed.recipientCnpj,
          recipientName: parsed.recipientName,
          totalValue: parsed.totalValue,
          status: inferNfseStatus(xmlContent),
          cfop,
          xmlContent,
        },
      });

      if (isNewInvoice) {
        newDocs++;
        saveXmlToFile(parsed.accessKey, parsed.type, xmlContent, parsed.issueDate).catch((err) => { log.error({ err }, 'saveXmlToFile failed'); });
      } else {
        updatedDocs++;
      }
      importedXmlCount++;
    }
  }

  return {
    newDocs,
    updatedDocs,
    lastNsu,
    scannedNsuCount,
    importedXmlCount,
    rateLimited,
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
    : await createSyncLogIfIdle(companyId, 'receita_nfse');

  if (!syncLog) throw new Error('SYNC_ALREADY_RUNNING');

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
