import { Prisma } from '@prisma/client';
import { openCertificatePems } from '@/lib/certificate-secret';
import { UF_TO_CODE } from '@/lib/constants';
import { acquirePostgresTransactionAdvisoryLock } from '@/lib/postgres-advisory-lock';
import { createInvoiceWithOutbox } from '@/lib/notification-outbox';
import { saveXmlToFile } from '@/lib/xml-file-store';
import { updateProductAggregatesForInvoice } from '@/lib/product-aggregate-updater';
import prisma from '@/lib/prisma';
import { createLogger } from '@/lib/logger';
import { buildNfeAccessKey, nextInvoiceNumber } from './access-key';
import { enviarNfeAutorizacao } from './autorizacao-client';
import { emitenteFromIssuedXml } from './emitente';
import { destinatarioFromIssuedXml, mergeDestinatario } from './destinatario';
import { assertCfopMatchesUfs, getSaidaOperation } from './operations';
import { defaultInfAdFisco, defaultInfCpl, DEFAULT_IND_PRES } from './issued-defaults';
import { nfeEmissionPayloadSchema } from './schema';
import { buildUnsignedNfeXml, draftDocumentTotal } from './xml-builder';
import { signNfeXml } from './xml-sign';
import { resolveEmissionEnvironment } from './environment';
import type { NfeEmissionItem } from './types';

const log = createLogger('nfe-emission');

export function nfeEmissionLockKey(companyId: string): string {
  return `nfe-emission-number:${companyId}`;
}

export type AuthorizeDeps = {
  send?: typeof enviarNfeAutorizacao;
};

export async function authorizeInvoiceEmission(
  companyId: string,
  emissionId: string,
  deps: AuthorizeDeps = {},
) {
  const send = deps.send || enviarNfeAutorizacao;
  const emission = await prisma.invoiceEmission.findFirst({
    where: { id: emissionId, companyId },
  });
  if (!emission) throw new Error('Rascunho não encontrado');
  if (emission.status === 'authorized') {
    return { status: 'authorized' as const, invoiceId: emission.invoiceId };
  }

  const payload = nfeEmissionPayloadSchema.parse(emission.payload);
  const destCnpj = payload.destCnpj;
  const customers = await listCustomerCnpjs(companyId);
  const destParts = await loadDestinatarioParts(companyId, destCnpj);
  const dest = mergeDestinatario(destCnpj, customers, destParts);

  const lastIssued = await prisma.invoice.findFirst({
    where: { companyId, type: 'NFE', direction: 'issued' },
    orderBy: { issueDate: 'desc' },
    select: { xmlContent: true },
  });
  if (!lastIssued?.xmlContent) {
    throw new Error('Não há NF-e emitida anterior para montar o emitente');
  }
  const company = await prisma.company.findFirstOrThrow({ where: { id: companyId } });
  const emit = await emitenteFromIssuedXml(lastIssued.xmlContent, company.cnpj);
  assertCfopMatchesUfs(payload.cfop, emit.ender.UF, dest.ender.UF);

  const cert = await prisma.certificateConfig.findUnique({ where: { companyId } });
  if (!cert) throw new Error('Certificado digital não configurado');
  if (cert.validTo && cert.validTo.getTime() < Date.now()) {
    throw new Error('Certificado digital vencido');
  }
  const pems = openCertificatePems(cert, company.cnpj);
  const environment = resolveEmissionEnvironment(cert.environment);
  const tpAmb = environment === 'production' ? '1' : '2';
  const cUf = UF_TO_CODE[emit.ender.UF];
  if (!cUf) throw new Error('UF do emitente sem código');

  const items: NfeEmissionItem[] = payload.items.map((item) => ({
    ...item,
    cfop: item.cfop || payload.cfop,
  }));

  const issueDate = new Date();
  const op = getSaidaOperation(payload.cfop);
  const extras = { vFrete: payload.vFrete, vSeg: payload.vSeg, vOutro: payload.vOutro };
  const numbered = await prisma.$transaction(async (tx) => {
    await acquirePostgresTransactionAdvisoryLock(tx, nfeEmissionLockKey(companyId));
    const existing = await tx.invoice.findMany({
      where: { companyId, type: 'NFE', direction: 'issued', series: payload.series },
      select: { number: true },
    });
    const pending = await tx.invoiceEmission.findMany({
      where: { companyId, series: payload.series, status: { in: ['submitted', 'authorized'] } },
      select: { number: true },
    });
    const number = String(nextInvoiceNumber([
      ...existing.map((row) => row.number),
      ...pending.map((row) => row.number || '0'),
    ]));
    const accessKey = buildNfeAccessKey({
      cUf,
      issueDate,
      cnpj: emit.cnpj,
      series: payload.series,
      number,
    });
    const unsigned = buildUnsignedNfeXml({
      natureza: payload.natureza || op?.natureza || 'Venda merc.adq. ou recb. terc.',
      cfop: payload.cfop,
      series: payload.series,
      number,
      issueDate,
      finNFe: payload.finNFe,
      indFinal: payload.indFinal,
      indPres: DEFAULT_IND_PRES,
      tpAmb,
      accessKey,
      emit,
      dest,
      items,
      modFrete: payload.modFrete,
      vFrete: payload.vFrete,
      vSeg: payload.vSeg,
      vOutro: payload.vOutro,
      transporta: payload.transporta,
      volume: payload.volume,
      pag: payload.pag,
      infCpl: defaultInfCpl(payload.cfop, payload.infCpl),
      infAdFisco: defaultInfAdFisco(payload.cfop, payload.infAdFisco),
    });
    const signed = signNfeXml(unsigned, pems.key, pems.cert);
    await tx.invoiceEmission.update({
      where: { id: emission.id },
      data: {
        status: 'submitted',
        number,
        accessKey,
        destName: dest.xNome,
        destCnpj,
        totalValue: new Prisma.Decimal(draftDocumentTotal(items, extras)),
        signedXml: signed,
      },
    });
    return { number, accessKey, signed };
  });

  let result;
  try {
    result = await send({
      signedNfeXml: numbered.signed,
      cUf,
      environment,
      certPem: pems.cert,
      keyPem: pems.key,
      idLote: String(Date.now()).slice(-15),
    });
  } catch (error) {
    await prisma.invoiceEmission.update({
      where: { id: emission.id },
      data: {
        status: 'rejected',
        sefazMotivo: error instanceof Error ? error.message : 'Falha ao enviar',
        number: null,
        accessKey: null,
      },
    });
    throw error;
  }

  const authorized = result.cStat === '100' || result.cStat === '150';
  if (!authorized || !result.xmlAutorizado) {
    await prisma.invoiceEmission.update({
      where: { id: emission.id },
      data: {
        status: 'rejected',
        sefazStat: result.cStat,
        sefazMotivo: result.xMotivo,
        number: null,
        accessKey: null,
      },
    });
    return { status: 'rejected' as const, cStat: result.cStat, xMotivo: result.xMotivo };
  }

  const xml = result.xmlAutorizado.replace('<chNFe></chNFe>', `<chNFe>${numbered.accessKey}</chNFe>`);
  const created = await createInvoiceWithOutbox({
    data: {
      accessKey: numbered.accessKey,
      type: 'NFE',
      direction: 'issued',
      number: numbered.number,
      series: payload.series,
      issueDate,
      senderCnpj: emit.cnpj,
      senderName: emit.xNome,
      recipientCnpj: dest.cnpj,
      recipientName: dest.xNome,
      totalValue: new Prisma.Decimal(draftDocumentTotal(items, extras)),
      status: 'received',
      cfop: payload.cfop,
      xmlContent: xml,
      companyId,
    },
  });
  await saveXmlToFile(numbered.accessKey, 'NFE', xml, issueDate);
  await updateProductAggregatesForInvoice({
    companyId,
    invoiceId: created.invoice.id,
    xmlContent: xml,
    direction: 'issued',
    issueDate,
    senderName: emit.xNome,
    senderCnpj: emit.cnpj,
    recipientName: dest.xNome,
    recipientCnpj: dest.cnpj,
    invoiceNumber: numbered.number,
  });
  await prisma.invoiceEmission.update({
    where: { id: emission.id },
    data: {
      status: 'authorized',
      sefazStat: result.cStat,
      sefazMotivo: result.xMotivo,
      protocolXml: xml,
      invoiceId: created.invoice.id,
    },
  });
  log.info({ emissionId, invoiceId: created.invoice.id, cStat: result.cStat }, 'NF-e autorizada');
  return { status: 'authorized' as const, invoiceId: created.invoice.id, accessKey: numbered.accessKey };
}

async function listCustomerCnpjs(companyId: string): Promise<Set<string>> {
  const rows = await prisma.invoice.findMany({
    where: { companyId, type: 'NFE', direction: 'issued', recipientCnpj: { not: null } },
    select: { recipientCnpj: true },
    distinct: ['recipientCnpj'],
  });
  return new Set(
    rows
      .map((row) => (row.recipientCnpj || '').replace(/\D/g, ''))
      .filter((cnpj) => cnpj.length === 14),
  );
}

async function loadDestinatarioParts(companyId: string, destCnpj: string) {
  const [fiscal, override, lastToDest] = await Promise.all([
    prisma.contactFiscal.findUnique({
      where: { companyId_cnpj: { companyId, cnpj: destCnpj } },
    }),
    prisma.contactOverride.findUnique({
      where: { companyId_cnpj: { companyId, cnpj: destCnpj } },
    }),
    prisma.invoice.findFirst({
      where: { companyId, type: 'NFE', direction: 'issued', recipientCnpj: destCnpj },
      orderBy: { issueDate: 'desc' },
      select: { xmlContent: true, recipientName: true },
    }),
  ]);
  const fromXml = lastToDest?.xmlContent
    ? await destinatarioFromIssuedXml(lastToDest.xmlContent, destCnpj)
    : null;
  return {
    name: lastToDest?.recipientName || fromXml?.xNome,
    ie: fiscal?.ie || fromXml?.ie,
    street: override?.street,
    number: override?.number,
    complement: override?.complement,
    district: override?.district,
    city: override?.city || fiscal?.city?.split(' - ')[0],
    state: override?.state || fiscal?.uf,
    zip: override?.zipCode,
    cMun: fromXml?.ender?.cMun,
    email: override?.email,
    fromXml,
  };
}
