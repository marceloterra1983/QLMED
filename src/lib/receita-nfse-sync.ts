import { CertificateManager } from '@/lib/certificate-manager';
import { decrypt } from '@/lib/crypto';
import { resolveInvoiceDirection } from '@/lib/invoice-direction';
import { parseInvoiceXml } from '@/lib/parse-invoice-xml';
import { ReceitaNfseClient, incrementNsu, normalizeNsu } from '@/lib/receita-nfse-client';
import { saveXmlToFile } from '@/lib/xml-file-store';

const DEFAULT_MAX_STEPS = 200;
const DEFAULT_EMPTY_LIMIT = 2;

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
  pfxData: Buffer;
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
    upsert: (args: any) => Promise<{ createdAt: Date; updatedAt: Date; id: string }>;
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
    prisma,
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

      const result = await prisma.invoice.upsert({
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
          xmlContent,
        },
      });

      if (result.createdAt.getTime() === result.updatedAt.getTime()) {
        newDocs++;
        saveXmlToFile(parsed.accessKey, parsed.type, xmlContent, parsed.issueDate).catch((err) => { console.error('[ReceitaNfseSync] saveXmlToFile failed:', (err as Error).message); });
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
