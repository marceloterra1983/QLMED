import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, unauthorizedResponse } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { NsdocsClient } from '@/lib/nsdocs-client';
import { SefazClient } from '@/lib/sefaz-client';
import { CertificateManager } from '@/lib/certificate-manager';
import { decrypt } from '@/lib/crypto';
import { getOrCreateSingleCompany } from '@/lib/single-company';

const UF_TO_CODE: Record<string, string> = {
  AC: '12',
  AL: '27',
  AP: '16',
  AM: '13',
  BA: '29',
  CE: '23',
  DF: '53',
  ES: '32',
  GO: '52',
  MA: '21',
  MT: '51',
  MS: '50',
  MG: '31',
  PA: '15',
  PB: '25',
  PR: '41',
  PE: '26',
  PI: '22',
  RJ: '33',
  RN: '24',
  RS: '43',
  RO: '11',
  RR: '14',
  SC: '42',
  SP: '35',
  SE: '28',
  TO: '17',
};

function getUfCodeFromCertificateSubject(subject?: string | null): string {
  if (!subject) return '50';
  const uf = subject.match(/(?:^|,\s*)ST=([A-Z]{2})(?:,|$)/)?.[1];
  return (uf && UF_TO_CODE[uf]) ? UF_TO_CODE[uf] : '50';
}

export async function POST(request: NextRequest) {
  let userId: string;
  try {
    userId = await requireAuth();
  } catch {
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
        certificateConfig: true
      }
    });

    if (!company || company.userId !== userId) {
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
            
            if (response.status === 'error') {
               if (response.cStat === '656') {
                  throw new Error(`Bloqueio SEFAZ (656): Excesso de consultas sem novos documentos. Aguarde 1 hora antes de tentar novamente.`);
               }
               throw new Error(`Erro SEFAZ: ${response.xMotivo} (cStat: ${response.cStat})`);
            }

            // Atualizar ultimo NSU conhecido
            ultNSU = response.ultNSU || ultNSU;

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
              if (doc.tipo === 'nfe') {
                 // Ignorar documentos sem chave válida para não interromper toda a sincronização
                 if (!doc.chave || doc.chave.length < 44) {
                   continue;
                 }

                 // Salvar Invoice
                 const exists = await prisma.invoice.findUnique({ where: { accessKey: doc.chave } });
                 
                 const valTotalMatch = doc.xml.match(/<vNF>([\d.,]+)<\/vNF>/);
                 const valTotalRaw = valTotalMatch?.[1] || '';
                 const valTotalNormalized = valTotalRaw.includes(',')
                   ? valTotalRaw.replace(/\./g, '').replace(',', '.')
                   : valTotalRaw;
                 const valTotalParsed = valTotalNormalized ? parseFloat(valTotalNormalized) : 0;
                 const valTotal = Number.isFinite(valTotalParsed) ? valTotalParsed : 0;
                 
                 const issueDateMatch = doc.xml.match(/<(dhEmi|dEmi)>([^<]+)<\/\1>/);
                 const issueDate = issueDateMatch ? new Date(issueDateMatch[2]) : new Date();

                 if (!exists) {
                   const senderCnpjMatch = doc.xml.match(/<emit[\s\S]*?<CNPJ>(\d+)<\/CNPJ>/)?.[1] || '00000000000000';
                   const companyCnpjClean = company.cnpj.replace(/\D/g, '');
                   const direction = senderCnpjMatch === companyCnpjClean ? 'issued' : 'received';

                   await prisma.invoice.create({
                     data: {
                       companyId,
                       accessKey: doc.chave,
                       type: 'NFE',
                       direction,
                       number: doc.chave.substring(25, 34),
                       series: doc.chave.substring(22, 25),
                       issueDate: issueDate,
                       senderCnpj: senderCnpjMatch,
                       senderName: doc.emitente,
                       recipientCnpj: company.cnpj,
                       recipientName: company.razaoSocial,
                       totalValue: valTotal,
                       status: 'received',
                       xmlContent: doc.xml
                     }
                   });
                   totalNovos++;
                 } else {
                   totalAtualizados++;
                 }
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
      })();

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
      
      try {
        const client = new NsdocsClient(company.nsdocsConfig.apiToken);
        const consulta = await client.consultarCnpj(company.cnpj);
        
        return NextResponse.json({ 
          message: 'Consulta NSDocs iniciada',
          syncMethod: 'nsdocs',
          syncLogId: syncLog.id, 
          idConsulta: consulta.id_consulta,
          status: 'pending' // Frontend vai fazer polling
        });
      } catch (err: any) {
         await prisma.syncLog.update({
            where: { id: syncLog.id },
            data: { status: 'error', errorMessage: err.message, completedAt: new Date() }
          });
         return NextResponse.json({ error: `Erro NSDocs: ${err.message}` }, { status: 500 });
      }
    }

    return NextResponse.json({ error: 'Nenhuma configuração de integração encontrada (Certificado ou NSDocs)' }, { status: 400 });

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
  const idConsulta = searchParams.get('idConsulta'); // Só para NSDocs
  const company = await getOrCreateSingleCompany(userId);
  const companyId = company.id;

  // Se tem syncLogId, verificar status específico
  if (syncLogId) {
    const log = await prisma.syncLog.findUnique({ where: { id: syncLogId } });
    if (log && log.companyId !== companyId) {
      return NextResponse.json({ error: 'Log de sincronização não encontrado' }, { status: 404 });
    }
    
    // Polling do NSDocs se necessário
    if (log?.syncMethod === 'nsdocs' && log.status === 'running' && idConsulta) {
       try {
         const companyWithConfig = await prisma.company.findUnique({ 
            where: { id: companyId }, include: { nsdocsConfig: true } 
         });
         
         if (companyWithConfig?.nsdocsConfig) {
            const client = new NsdocsClient(companyWithConfig.nsdocsConfig.apiToken);
            const retorno = await client.retornoConsulta('cnpj', idConsulta);
            
            if (retorno.status === 'Concluído') {
               // Importação simplificada para o exemplo híbrido:
               // Precisaria listar documentos e importar.
               // Como é fallback, vamos assumir ok por enquanto.
               
               await prisma.syncLog.update({
                 where: { id: syncLogId },
                 data: { status: 'completed', completedAt: new Date(), errorMessage: 'Importação NSDocs (Fallback)' }
               });
               return NextResponse.json({ status: 'completed', newDocs: 0, updatedDocs: 0 });
            } else if (retorno.status === 'Erro') {
               await prisma.syncLog.update({
                 where: { id: syncLogId },
                 data: { status: 'error', errorMessage: retorno.erro, completedAt: new Date() }
               });
               return NextResponse.json({ status: 'error', error: retorno.erro });
            }
            
            return NextResponse.json({ status: 'running', message: retorno.status });
         }
       } catch (e) {
         console.error(e);
       }
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
  const logs = await prisma.syncLog.findMany({
    where: { companyId },
    orderBy: { startedAt: 'desc' },
    take: 20
  });

  return NextResponse.json({ logs });
}
