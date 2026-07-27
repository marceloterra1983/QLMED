import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { fetchAnvisaData } from '@/lib/anvisa-api';
import { requireAuth, unauthorizedResponse } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { createLogger } from '@/lib/logger';

const log = createLogger('anvisa/validate');

const anvisaCodeSchema = z.object({
  code: z.preprocess(
    (value) => String(value ?? '').replace(/\D/g, ''),
    z.string().min(7, 'Código ANVISA inválido. Informe pelo menos 7 dígitos.'),
  ),
});

/**
 * GET /api/anvisa/validate?code=XXXXXXXXXXX
 * Real-time ANVISA registration validation.
 * Checks product_registry cache first (if synced within 7 days), otherwise queries ANVISA API.
 */
export async function GET(req: NextRequest) {
  try {
    await requireAuth();
  } catch {
    return unauthorizedResponse();
  }

  const codeParsed = anvisaCodeSchema.safeParse({ code: req.nextUrl.searchParams.get('code') });
  const code = (req.nextUrl.searchParams.get('code') || '').replace(/\D/g, '');

  if (!code || code.length < 7 || !codeParsed.success) {
    return NextResponse.json(
      { error: 'Código ANVISA inválido. Informe pelo menos 7 dígitos.' },
      { status: 400 },
    );
  }

  try {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const cached = await prisma.productRegistry.findFirst({
      where: {
        anvisaCode: code,
        anvisaSyncedAt: { gt: since },
        anvisaStatus: { not: null },
      },
      select: {
        anvisaMatchedProductName: true,
        anvisaHolder: true,
        anvisaStatus: true,
        anvisaExpiration: true,
        anvisaRiskClass: true,
        anvisaProcess: true,
        anvisaSyncedAt: true,
      },
    });

    if (cached) {
      return NextResponse.json({
        registration: code,
        productName: cached.anvisaMatchedProductName || null,
        company: cached.anvisaHolder || null,
        status: cached.anvisaStatus || null,
        expiration: cached.anvisaExpiration || null,
        riskClass: cached.anvisaRiskClass || null,
        process: cached.anvisaProcess || null,
        cached: true,
      });
    }

    const data = await fetchAnvisaData(code);

    if (!data) {
      return NextResponse.json({
        registration: code,
        productName: null,
        company: null,
        status: null,
        expiration: null,
        riskClass: null,
        process: null,
        cached: false,
        notFound: true,
      });
    }

    const matches = await prisma.productRegistry.findMany({
      where: { anvisaCode: code },
      select: {
        id: true,
        anvisaMatchedProductName: true,
        anvisaHolder: true,
        anvisaStatus: true,
        anvisaProcess: true,
      },
    });

    const now = new Date();
    for (const row of matches) {
      await prisma.productRegistry.update({
        where: { id: row.id },
        data: {
          anvisaMatchedProductName: data.nomeProduto ?? row.anvisaMatchedProductName,
          anvisaHolder: data.nomeEmpresa ?? row.anvisaHolder,
          anvisaStatus: data.situacaoRegistro ?? row.anvisaStatus,
          anvisaExpiration: data.vencimentoRegistro,
          anvisaRiskClass: data.classeRisco,
          anvisaProcess: data.processoRegistro ?? row.anvisaProcess,
          anvisaSyncedAt: now,
        },
      });
    }

    return NextResponse.json({
      registration: code,
      productName: data.nomeProduto,
      company: data.nomeEmpresa,
      status: data.situacaoRegistro,
      expiration: data.vencimentoRegistro,
      riskClass: data.classeRisco,
      process: data.processoRegistro,
      dataset: data.dataset,
      cached: false,
    });
  } catch (err) {
    log.error({ err }, '[anvisa/validate] Error');
    return NextResponse.json({ error: 'Erro ao validar registro ANVISA' }, { status: 500 });
  }
}
