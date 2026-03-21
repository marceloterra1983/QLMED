import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireEditor, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { NsdocsClient } from '@/lib/nsdocs-client';
import { SefazClient } from '@/lib/sefaz-client';
import { CertificateManager } from '@/lib/certificate-manager';
import { decrypt } from '@/lib/crypto';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import { parseInvoiceXml } from '@/lib/parse-invoice-xml';
import { getNsdocsSyncWindow } from '@/lib/nsdocs-sync-window';
import { mapSourceStatusToInvoiceStatus } from '@/lib/source-status';
import { resolveInvoiceDirection } from '@/lib/invoice-direction';
import { updateProductAggregatesForInvoice } from '@/lib/product-aggregate-updater';
import { syncReceitaNfseByNsu } from '@/lib/receita-nfse-sync';
import { UF_TO_CODE } from '@/lib/constants';

function getUfCodeFromCertificateSubject(subject?: string | null): string {
  if (!subject) return '50';
  const uf = subject.match(/(?:^|,\s*)ST=([A-Z]{2})(?:,|$)/)?.[1];
  return (uf && UF_TO_CODE[uf]) ? UF_TO_CODE[uf] : '50';
}

export async function POST(request: NextRequest) {
  let userId: string;
  try {
    const auth = await requireEditor();
    userId = auth.userId;
  } catch (e: any) {
    if (e.message === 'FORBIDDEN') return forbiddenResponse();
    return unauthorizedResponse();
  }

  try {
    const body = await request.json();
    const { method } = body;
    const baseCompany = await getOrCreateSingleCompany(userId);
    const company = await prisma.company.findUnique({
      where: { id: baseCompany.id },
      include: {
        nsdocsConfig: true,
        receitaNfseConfig: true,
        certificateConfig: true
      }
    });

    if (!company) {
      return NextResponse.json({ error: 'Empresa não encontrada' }, { status: 404 });
    }

    const companyId = company.id;

    // Se method foi especificado, validar disponibilidade
    if (method === 'sefaz' && !company.certificateConfig) {
      return NextResponse.json({ error: 'Certificado digital não configurado para esta empresa' }, { status: 400 });
    }
    if (method === 'nsdocs' && !company.nsdocsConfig) {
      return NextResponse.json({ error: 'Integração NSDocs não configurada para esta empresa' }, { status: 400 });
    }
    if (method === 'receita_nfse' && !company.receitaNfseConfig) {
      return NextResponse.json({ error: 'Integração Receita NFS-e não configurada para esta empresa' }, { status: 400 });
    }
    if (method === 'receita_nfse' && !company.certificateConfig) {
      return NextResponse.json({ error: 'Certificado digital não configurado para integrar com Receita NFS-e' }, { status: 400 });
    }

    // SEFAZ: se method='sefaz' explícito OU fallback automático (sem method)
    if ((method === 'sefaz' || !method) && company.certificateConfig) {
      const cert = company.certificateConfig;
      
      const syncLog = await prisma.syncLog.create({
        data: {
          companyId,
          syncMethod: 'sefaz',
          status: 'running',
          errorMessage: null
        }
      });

      // Processamento Assíncrono (Fire and forget para não bloquear request)
      (async () => {
        let ultNSU = cert.lastNsu || '0';
        try {
          // Extrair chaves (PEM) usando node-forge para lidar com PFX modernas/complexas
          // Isso evita erros de "Unsupported PKCS12 PFX data" em alguns ambientes Node.js
          const pfxPassword = decrypt(cert.pfxPassword);
          const { key, cert: certPem } = CertificateManager.extractPems(cert.pfxData, pfxPassword);
          
          const sefaz = new SefazClient(
            certPem,
            key, 
            company.cnpj, 
            cert.environment === 'production',
            getUfCodeFromCertificateSubject(cert.subject)
          );

          let temMais = true;
          let totalNovos = 0;
          let totalAtualizados = 0;
          let loopCount = 0;

          while (temMais && loopCount < 50) { // Aumentado para 50 loops (aprox 2500 docs)
            loopCount++;
            const nsuAntesDaConsulta = ultNSU;
            
            // Buscar na SEFAZ
            const response = await sefaz.buscarNovosDocumentos(ultNSU);
            
            // Always advance ultNSU even on error (SEFAZ returns valid ultNSU with 656)
            if (response.ultNSU) ultNSU = response.ultNSU;

            if (response.status === 'error') {
               if (response.cStat === '656') {
                  throw new Error(`Bloqueio SEFAZ (656): Excesso de consultas sem novos documentos. Aguarde 1 hora antes de tentar novamente.`);
               }
               throw new Error(`Erro SEFAZ: ${response.xMotivo} (cStat: ${response.cStat})`);
            }

            // Quando a SEFAZ retorna "sem documentos" (cStat 137),
            // uma nova consulta imediata pode gerar bloqueio 656.
            if (response.status === 'empty') {
              temMais = false;
              break;
            }

            // Se não trouxe documentos e NSU não avançou, não há progresso possível nesta execução.
            if (response.docs.length === 0 && ultNSU === nsuAntesDaConsulta) {
              temMais = false;
              break;
            }

            // Processar documentos
            for (const doc of response.docs) {
              try {
                if (!doc.chave || doc.chave.length < 44 || !doc.xml) continue;

                const parsed = await parseInvoiceXml(doc.xml);
                if (!parsed) continue;

                const accessKey = parsed.accessKey || doc.chave;
                const direction = resolveInvoiceDirection(company.cnpj, parsed.senderCnpj, accessKey);

                const result = await prisma.invoice.upsert({
                  where: { accessKey },
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
                    xmlContent: doc.xml,
                  },
                  create: {
                    companyId,
                    accessKey,
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
                    status: 'received',
                    xmlContent: doc.xml,
                  },
                });
                if (result.createdAt.getTime() === result.updatedAt.getTime()) {
                  totalNovos++;
                } else {
                  totalAtualizados++;
                }
                if (parsed.type === 'NFE' && doc.xml) {
                  updateProductAggregatesForInvoice({
                    companyId,
                    invoiceId: result.id,
                    xmlContent: doc.xml,
                    direction,
                    issueDate: parsed.issueDate ? new Date(parsed.issueDate) : null,
                    senderName: parsed.senderName,
                    senderCnpj: parsed.senderCnpj,
                    recipientName: parsed.recipientName,
                    recipientCnpj: parsed.recipientCnpj,
                    invoiceNumber: parsed.number,
                  }).catch((err) => { console.error('[SEFAZ Sync] updateProductAggregatesForInvoice failed:', (err as Error).message); });
                }
              } catch (docErr: any) {
                console.error(`[SEFAZ Sync] Erro ao processar documento:`, docErr);
              }
            }
            
            // Verificar se tem mais
            const ultNsuBigInt = BigInt(response.ultNSU || '0');
            const maxNsuBigInt = BigInt(response.maxNSU || '0');
            if (ultNsuBigInt >= maxNsuBigInt) {
              temMais = false;
            }
          }

          // Atualizar Config e Log
          await prisma.certificateConfig.update({
            where: { id: cert.id },
            data: { 
              lastNsu: ultNSU,
              lastSyncAt: new Date()
            }
          });

          await prisma.syncLog.update({
             where: { id: syncLog.id },
             data: {
               status: 'completed',
               newDocs: totalNovos,
               updatedDocs: totalAtualizados,
               completedAt: new Date()
             }
          });

        } catch (err: any) {
          console.error('Erro no Sync SEFAZ:', err);
          try {
            await prisma.certificateConfig.update({
              where: { id: cert.id },
              data: { lastNsu: ultNSU }
            });
          } catch (nsuUpdateError) {
            console.error('Erro ao atualizar lastNsu após falha:', nsuUpdateError);
          }
          await prisma.syncLog.update({
            where: { id: syncLog.id },
            data: {
              status: 'error',
              errorMessage: err.message,
              completedAt: new Date()
            }
          });
        }
      })().catch((err) => { console.error('[SEFAZ Sync] Unhandled error in fire-and-forget:', (err as Error).message); });

      return NextResponse.json({
        message: 'Sincronização SEFAZ iniciada', 
        syncMethod: 'sefaz',
        syncLogId: syncLog.id 
      });
    }

    // NSDocs: se method='nsdocs' explícito OU fallback automático (sem method)
    if ((method === 'nsdocs' || !method) && company.nsdocsConfig) {
      const syncLog = await prisma.syncLog.create({
        data: {
          companyId,
          syncMethod: 'nsdocs',
          status: 'running'
        }
      });

      const nsdocsToken = decrypt(company.nsdocsConfig.apiToken);
      const nsdocsConfigId = company.nsdocsConfig.id;
      const nsdocsLastSyncAt = company.nsdocsConfig.lastSyncAt;
      const companyCnpj = company.cnpj;
      const companyRazao = company.razaoSocial;

      // Fire-and-forget: listar documentos recentes e importar XMLs
      (async () => {
        try {
          const client = new NsdocsClient(nsdocsToken);

          const { dtInicial, dtFinal, syncedAt } = getNsdocsSyncWindow(nsdocsLastSyncAt);

          const documentos = await client.listarTodosDocumentos({
            dtInicial,
            dtFinal,
            ordenacao_campo: 'dataemissao',
            ordenacao_tipo: 'asc',
          });

          let totalNovos = 0;
          let totalAtualizados = 0;

          for (const doc of documentos) {
            try {
              if (!doc.id) continue;

              const xmlContent = await client.recuperarXml(doc.id);
              if (!xmlContent || xmlContent.length < 50) continue;

              const parsed = await parseInvoiceXml(xmlContent);
              if (!parsed || !parsed.accessKey) continue;

              const mappedStatus = mapSourceStatusToInvoiceStatus(parsed.type, doc.situacao);
              const direction = resolveInvoiceDirection(companyCnpj, parsed.senderCnpj, parsed.accessKey);

              // Use upsert to handle race conditions on accessKey
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
                  status: mappedStatus,
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
                  status: mappedStatus,
                  xmlContent,
                },
              });
              // If updatedAt > createdAt, it was an update; otherwise new
              if (result.createdAt.getTime() === result.updatedAt.getTime()) {
                totalNovos++;
              } else {
                totalAtualizados++;
              }
              if (parsed.type === 'NFE' && xmlContent) {
                updateProductAggregatesForInvoice({
                  companyId,
                  invoiceId: result.id,
                  xmlContent,
                  direction,
                  issueDate: parsed.issueDate ? new Date(parsed.issueDate) : null,
                  senderName: parsed.senderName,
                  senderCnpj: parsed.senderCnpj,
                  recipientName: parsed.recipientName,
                  recipientCnpj: parsed.recipientCnpj,
                  invoiceNumber: parsed.number,
                }).catch((err) => { console.error('[NSDocs Sync] updateProductAggregatesForInvoice failed:', (err as Error).message); });
              }
            } catch (docErr) {
              console.error(`[NSDocs Sync] Erro no doc:`, docErr);
            }
          }

          await prisma.syncLog.update({
            where: { id: syncLog.id },
            data: {
              status: 'completed',
              newDocs: totalNovos,
              updatedDocs: totalAtualizados,
              completedAt: new Date(),
            },
          });

          await prisma.nsdocsConfig.update({
            where: { id: nsdocsConfigId },
            data: { lastSyncAt: syncedAt },
          });

          console.log(`[NSDocs Sync] Concluído: ${companyRazao} - ${totalNovos} novos, ${totalAtualizados} existentes`);

        } catch (err: any) {
          console.error('[NSDocs Sync] Erro:', err);
          await prisma.syncLog.update({
            where: { id: syncLog.id },
            data: { status: 'error', errorMessage: err.message, completedAt: new Date() },
          });
        }
      })().catch((err) => { console.error('[NSDocs Sync] Unhandled error in fire-and-forget:', (err as Error).message); });

      return NextResponse.json({
        message: 'Sincronização NSDocs iniciada',
        syncMethod: 'nsdocs',
        syncLogId: syncLog.id,
      });
    }

    // Receita NFS-e (ADN): apenas quando solicitado explicitamente.
    if (method === 'receita_nfse' && company.receitaNfseConfig && company.certificateConfig) {
      const syncLog = await prisma.syncLog.create({
        data: {
          companyId,
          syncMethod: 'receita_nfse',
          status: 'running'
        }
      });

      const receitaConfig = {
        ...company.receitaNfseConfig,
      };
      const certificateConfig = company.certificateConfig;
      const companyCnpj = company.cnpj;
      const companyRazao = company.razaoSocial;

      (async () => {
        try {
          const result = await syncReceitaNfseByNsu({
            prisma,
            companyId,
            companyCnpj,
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

          console.log(
            `[Receita NFS-e Sync] Concluído: ${companyRazao} - ` +
            `${result.newDocs} novos, ${result.updatedDocs} atualizados, NSUs lidos: ${result.scannedNsuCount}, último NSU: ${result.lastNsu}`
          );
        } catch (err: any) {
          console.error('[Receita NFS-e Sync] Erro:', err);
          await prisma.syncLog.update({
            where: { id: syncLog.id },
            data: {
              status: 'error',
              errorMessage: err.message || 'Erro interno na sincronização Receita NFS-e',
              completedAt: new Date(),
            },
          });
        }
      })().catch((err) => { console.error('[Receita NFS-e Sync] Unhandled error in fire-and-forget:', (err as Error).message); });

      return NextResponse.json({
        message: 'Sincronização Receita NFS-e iniciada',
        syncMethod: 'receita_nfse',
        syncLogId: syncLog.id,
      });
    }

    return NextResponse.json({ error: 'Nenhuma configuração de integração encontrada (SEFAZ, NSDocs ou Receita NFS-e)' }, { status: 400 });

  } catch (error) {
    console.error('Erro geral no sync:', error);
    return NextResponse.json({ error: 'Erro interno no servidor' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  let userId: string;
  try {
    userId = await requireAuth();
  } catch {
    return unauthorizedResponse();
  }

  const { searchParams } = new URL(request.url);
  const syncLogId = searchParams.get('syncLogId');
  const company = await getOrCreateSingleCompany(userId);
  const companyId = company.id;

  // Se tem syncLogId, verificar status específico
  if (syncLogId) {
    const log = await prisma.syncLog.findUnique({ where: { id: syncLogId } });
    if (log && log.companyId !== companyId) {
      return NextResponse.json({ error: 'Log de sincronização não encontrado' }, { status: 404 });
    }

    return NextResponse.json({
      status: log?.status || 'unknown',
      newDocs: log?.newDocs || 0,
      updatedDocs: log?.updatedDocs || 0,
      error: log?.errorMessage,
      syncMethod: log?.syncMethod
    });
  }

  // Se não tem syncLogId, retornar histórico (logs)
  // Trazemos fatias por método para evitar que um método "esconda" os demais.
  const [nsdocsLogs, sefazLogs, receitaLogs] = await Promise.all([
    prisma.syncLog.findMany({
      where: { companyId, syncMethod: 'nsdocs' },
      orderBy: { startedAt: 'desc' },
      take: 20,
    }),
    prisma.syncLog.findMany({
      where: { companyId, syncMethod: 'sefaz' },
      orderBy: { startedAt: 'desc' },
      take: 20,
    }),
    prisma.syncLog.findMany({
      where: { companyId, syncMethod: 'receita_nfse' },
      orderBy: { startedAt: 'desc' },
      take: 20,
    }),
  ]);

  const logs = [...nsdocsLogs, ...sefazLogs, ...receitaLogs].sort(
    (a, b) => b.startedAt.getTime() - a.startedAt.getTime()
  );

  return NextResponse.json({ logs });
}
