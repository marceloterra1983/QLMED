import { Prisma } from '@prisma/client';
import { CertificateManager } from '@/lib/certificate-manager';
import { decrypt } from '@/lib/crypto';
import { UF_TO_CODE } from '@/lib/constants';
import { acquirePostgresTransactionAdvisoryLock } from '@/lib/postgres-advisory-lock';
import { createInvoiceWithOutbox } from '@/lib/notification-outbox';
import { saveXmlToFile } from '@/lib/xml-file-store';
import { updateProductAggregatesForInvoice } from '@/lib/product-aggregate-updater';
import prisma from '@/lib/prisma';
import { createLogger } from '@/lib/logger';
import { buildNfeAccessKey, nextInvoiceNumber } from './access-key';
import { consultarNfeProtocolo, enviarNfeAutorizacao, wrapNfeProc } from './autorizacao-client';
import { emitenteFromIssuedXml } from './emitente';
import { destinatarioFromIssuedXml, mergeDestinatario } from './destinatario';
import { assertCfopMatchesUfs, getSaidaOperation } from './operations';
import { defaultInfAdFisco, defaultInfCpl, DEFAULT_IND_PRES } from './issued-defaults';
import { nfeEmissionPayloadSchema } from './schema';
import { buildUnsignedNfeXml, draftDocumentTotal } from './xml-builder';
import { signNfeXml } from './xml-sign';
import { resolveEmissionEnvironment } from './environment';
import type { SefazEnvironment } from './autorizacao-urls';
import type { NfeEmissionItem } from './types';

const log = createLogger('nfe-emission');

export function nfeEmissionLockKey(companyId: string): string {
  return `nfe-emission-number:${companyId}`;
}

export type AuthorizeDeps = {
  send?: typeof enviarNfeAutorizacao;
  consult?: typeof consultarNfeProtocolo;
};

export type AuthorizeResult =
  | { status: 'authorized'; invoiceId: string | null; accessKey?: string }
  | { status: 'rejected'; cStat: string; xMotivo: string }
  /**
   * A SEFAZ pode ter recebido a nota e nós não sabemos. Número e chave
   * continuam reservados; quem chama deve consultar de novo, nunca reenviar.
   */
  | { status: 'pending'; cStat?: string; xMotivo: string };

type EmissionContext = {
  companyId: string;
  emissionId: string;
  cUf: string;
  environment: SefazEnvironment;
  certPem: string;
  keyPem: string;
};

export async function authorizeInvoiceEmission(
  companyId: string,
  emissionId: string,
  deps: AuthorizeDeps = {},
): Promise<AuthorizeResult> {
  const send = deps.send || enviarNfeAutorizacao;
  const consult = deps.consult || consultarNfeProtocolo;
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
  const password = decrypt(cert.pfxPassword);
  const pems = CertificateManager.extractPems(Buffer.from(cert.pfxData), password);
  const environment = resolveEmissionEnvironment(cert.environment);
  const tpAmb = environment === 'production' ? '1' : '2';
  const cUf = UF_TO_CODE[emit.ender.UF];
  if (!cUf) throw new Error('UF do emitente sem código');

  const ctx: EmissionContext = {
    companyId,
    emissionId: emission.id,
    cUf,
    environment,
    certPem: pems.cert,
    keyPem: pems.key,
  };

  // Já enviada e sem desfecho gravado: a SEFAZ é a fonte da verdade, não o
  // nosso banco. Perguntar pelo protocolo é o que impede a reemissão cega.
  if (emission.status === 'submitted') {
    return resolveSubmittedEmission(ctx, emission.accessKey, emission.signedXml, consult);
  }

  const items: NfeEmissionItem[] = payload.items.map((item) => ({
    ...item,
    cfop: item.cfop || payload.cfop,
  }));

  const issueDate = new Date();
  const op = getSaidaOperation(payload.cfop);
  const extras = { vFrete: payload.vFrete, vSeg: payload.vSeg, vOutro: payload.vOutro };
  const numbered = await prisma.$transaction(async (tx) => {
    await acquirePostgresTransactionAdvisoryLock(tx, nfeEmissionLockKey(companyId));
    // Compare-and-swap: só sai de draft/rejected uma vez. Sem isto, duas
    // requisições concorrentes numeravam N e N+1 e enviavam duas NF-e para o
    // mesmo rascunho (QLMED-FISCAL-001). O lock advisory serializa as
    // transações; o CAS é o que decide qual delas segue.
    const claimed = await tx.invoiceEmission.updateMany({
      where: { id: emission.id, companyId, status: { in: ['draft', 'rejected'] } },
      data: { status: 'submitted' },
    });
    if (claimed.count === 0) return null;

    const existing = await tx.invoice.findMany({
      where: { companyId, type: 'NFE', direction: 'issued', series: payload.series },
      select: { number: true },
    });
    const pending = await tx.invoiceEmission.findMany({
      where: {
        companyId,
        series: payload.series,
        status: { in: ['submitted', 'authorized'] },
        id: { not: emission.id },
      },
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

  if (!numbered) {
    // Outra requisição ganhou o CAS. Nunca enviar por cima dela.
    const current = await prisma.invoiceEmission.findFirst({
      where: { id: emission.id, companyId },
      select: { status: true, invoiceId: true },
    });
    if (current?.status === 'authorized') {
      return { status: 'authorized' as const, invoiceId: current.invoiceId };
    }
    log.warn({ emissionId }, 'Authorize concorrente recusado pelo CAS');
    return {
      status: 'pending' as const,
      xMotivo: 'Já existe uma autorização em andamento para este rascunho',
    };
  }

  let result;
  try {
    result = await send({
      signedNfeXml: numbered.signed,
      cUf,
      environment,
      certPem: pems.cert,
      keyPem: pems.key,
      idLote: String(Date.now()).slice(-15),
      accessKey: numbered.accessKey,
    });
  } catch (error) {
    // Timeout ou erro de transporte NÃO é rejeição: a SEFAZ pode ter
    // autorizado. Mantém `submitted`, número e chave (QLMED-FISCAL-004) —
    // apagá-los era o que abria caminho para a segunda emissão.
    const message = error instanceof Error ? error.message : 'Falha ao enviar';
    await prisma.invoiceEmission.update({
      where: { id: emission.id },
      data: { sefazMotivo: message },
    });
    log.error({ emissionId, err: message }, 'Envio SEFAZ sem desfecho conhecido');
    return {
      status: 'pending' as const,
      xMotivo: `${message}. A nota pode ter sido recebida pela SEFAZ; consulte antes de tentar de novo.`,
    };
  }

  if (result.outcome === 'pending') {
    await prisma.invoiceEmission.update({
      where: { id: emission.id },
      data: { sefazStat: result.cStat || null, sefazMotivo: result.xMotivo },
    });
    return { status: 'pending' as const, cStat: result.cStat, xMotivo: result.xMotivo };
  }

  if (result.outcome === 'rejected' || !result.xmlAutorizado) {
    // Rejeição definitiva: a nota não foi autorizada e o número volta a ficar
    // disponível para a próxima tentativa.
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

  return finalizeAuthorized(ctx, {
    accessKey: numbered.accessKey,
    number: numbered.number,
    series: payload.series,
    issueDate,
    xml: result.xmlAutorizado,
    cStat: result.cStat,
    xMotivo: result.xMotivo,
    emit,
    dest,
    cfop: payload.cfop,
    totalValue: draftDocumentTotal(items, extras),
  });
}

/**
 * Emissão que já saiu daqui e não tem desfecho gravado. Pergunta à SEFAZ pelo
 * protocolo em vez de reenviar — QLMED-FISCAL-004 e -005.
 */
async function resolveSubmittedEmission(
  ctx: EmissionContext,
  accessKey: string | null,
  signedXml: string | null,
  consult: typeof consultarNfeProtocolo,
): Promise<AuthorizeResult> {
  if (!accessKey || !signedXml) {
    return {
      status: 'pending',
      xMotivo: 'Emissão em andamento sem chave gravada; verifique manualmente antes de reenviar',
    };
  }

  let consulta;
  try {
    consulta = await consult({
      accessKey,
      cUf: ctx.cUf,
      environment: ctx.environment,
      certPem: ctx.certPem,
      keyPem: ctx.keyPem,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha na consulta';
    log.error({ emissionId: ctx.emissionId, err: message }, 'Consulta de protocolo falhou');
    return { status: 'pending', xMotivo: `Consulta de protocolo indisponível: ${message}` };
  }

  if (consulta.outcome === 'authorized' && consulta.protNFe) {
    const invoice = await prisma.invoice.findUnique({
      where: { accessKey },
      select: {
        id: true, number: true, series: true, issueDate: true,
        senderCnpj: true, senderName: true, recipientCnpj: true, recipientName: true,
        totalValue: true, cfop: true,
      },
    });
    const xml = wrapNfeProc(signedXml, consulta.protNFe);
    if (invoice) {
      // A nota já virou Invoice numa tentativa anterior que morreu antes de
      // fechar o rascunho. Só falta carimbar o estado.
      await prisma.invoiceEmission.update({
        where: { id: ctx.emissionId },
        data: {
          status: 'authorized',
          sefazStat: consulta.cStat,
          sefazMotivo: consulta.xMotivo,
          protocolXml: xml,
          invoiceId: invoice.id,
        },
      });
      return { status: 'authorized', invoiceId: invoice.id, accessKey };
    }
    return {
      status: 'pending',
      cStat: consulta.cStat,
      xMotivo: 'NF-e autorizada na SEFAZ mas ainda não registrada aqui; rode a reconciliação antes de emitir outra',
    };
  }

  if (consulta.outcome === 'absent') {
    // Só agora é seguro liberar número e chave: a SEFAZ afirma que a nota
    // não existe na base dela.
    await prisma.invoiceEmission.update({
      where: { id: ctx.emissionId },
      data: {
        status: 'draft',
        sefazStat: consulta.cStat,
        sefazMotivo: consulta.xMotivo,
        number: null,
        accessKey: null,
        signedXml: null,
      },
    });
    return {
      status: 'pending',
      cStat: consulta.cStat,
      xMotivo: 'A SEFAZ não recebeu esta nota. O rascunho foi liberado; autorize novamente.',
    };
  }

  if (consulta.outcome === 'rejected') {
    // Denegada consome número e chave: os dois ficam gravados de propósito.
    await prisma.invoiceEmission.update({
      where: { id: ctx.emissionId },
      data: { status: 'rejected', sefazStat: consulta.cStat, sefazMotivo: consulta.xMotivo },
    });
    return { status: 'rejected', cStat: consulta.cStat, xMotivo: consulta.xMotivo };
  }

  await prisma.invoiceEmission.update({
    where: { id: ctx.emissionId },
    data: { sefazStat: consulta.cStat || null, sefazMotivo: consulta.xMotivo },
  });
  return { status: 'pending', cStat: consulta.cStat, xMotivo: consulta.xMotivo };
}

/**
 * Persistência pós-autorização, idempotente por chave de acesso. Um crash no
 * meio deixava `submitted` e a tentativa seguinte emitia OUTRA chave
 * (QLMED-FISCAL-005); agora a chave existente é reaproveitada.
 */
async function finalizeAuthorized(
  ctx: EmissionContext,
  input: {
    accessKey: string;
    number: string;
    series: string;
    issueDate: Date;
    xml: string;
    cStat: string;
    xMotivo: string;
    emit: { cnpj: string; xNome: string };
    dest: { cnpj: string; xNome: string };
    cfop: string;
    totalValue: number | string;
  },
): Promise<AuthorizeResult> {
  const existing = await prisma.invoice.findUnique({
    where: { accessKey: input.accessKey },
    select: { id: true },
  });

  let invoiceId: string;
  if (existing) {
    invoiceId = existing.id;
  } else {
    const created = await createInvoiceWithOutbox({
      data: {
        accessKey: input.accessKey,
        type: 'NFE',
        direction: 'issued',
        number: input.number,
        series: input.series,
        issueDate: input.issueDate,
        senderCnpj: input.emit.cnpj,
        senderName: input.emit.xNome,
        recipientCnpj: input.dest.cnpj,
        recipientName: input.dest.xNome,
        totalValue: new Prisma.Decimal(input.totalValue),
        status: 'received',
        cfop: input.cfop,
        xmlContent: input.xml,
        companyId: ctx.companyId,
      },
    });
    invoiceId = created.invoice.id;
    await updateProductAggregatesForInvoice({
      companyId: ctx.companyId,
      invoiceId,
      xmlContent: input.xml,
      direction: 'issued',
      issueDate: input.issueDate,
      senderName: input.emit.xNome,
      senderCnpj: input.emit.cnpj,
      recipientName: input.dest.xNome,
      recipientCnpj: input.dest.cnpj,
      invoiceNumber: input.number,
    });
  }

  // Escrita de ficheiro é idempotente; roda também no retry para não deixar
  // o backup em XML faltando quando a primeira tentativa morreu aqui.
  await saveXmlToFile(input.accessKey, 'NFE', input.xml, input.issueDate);

  await prisma.invoiceEmission.update({
    where: { id: ctx.emissionId },
    data: {
      status: 'authorized',
      sefazStat: input.cStat,
      sefazMotivo: input.xMotivo,
      protocolXml: input.xml,
      invoiceId,
    },
  });
  log.info({ emissionId: ctx.emissionId, invoiceId, cStat: input.cStat }, 'NF-e autorizada');
  return { status: 'authorized', invoiceId, accessKey: input.accessKey };
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
