import { NextRequest, NextResponse } from 'next/server';
import { fetchAnvisaData } from '@/lib/anvisa-api';
import prisma from '@/lib/prisma';

/**
 * GET /api/anvisa/validate?code=XXXXXXXXXXX
 * Real-time ANVISA registration validation.
 * Checks product_registry cache first (if synced within 7 days), otherwise queries ANVISA API.
 */
export async function GET(req: NextRequest) {
  const code = (req.nextUrl.searchParams.get('code') || '').replace(/\D/g, '');

  if (!code || code.length < 7) {
    return NextResponse.json(
      { error: 'Código ANVISA inválido. Informe pelo menos 7 dígitos.' },
      { status: 400 },
    );
  }

  try {
    // Check if we have recent data in product_registry
    const cached = await prisma.$queryRawUnsafe<any[]>(
      `SELECT
         anvisa_matched_product_name AS "productName",
         anvisa_holder AS company,
         anvisa_status AS status,
         anvisa_expiration AS expiration,
         anvisa_risk_class AS "riskClass",
         anvisa_process AS process,
         anvisa_synced_at AS "syncedAt"
       FROM product_registry
       WHERE anvisa_code = $1
         AND anvisa_synced_at > NOW() - INTERVAL '7 days'
         AND anvisa_status IS NOT NULL
       LIMIT 1`,
      code,
    );

    if (cached.length > 0) {
      const row = cached[0];
      return NextResponse.json({
        registration: code,
        productName: row.productName || null,
        company: row.company || null,
        status: row.status || null,
        expiration: row.expiration || null,
        riskClass: row.riskClass || null,
        process: row.process || null,
        cached: true,
      });
    }

    // Fetch from ANVISA API
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

    // If we have a matching product in registry, update it
    await prisma.$executeRawUnsafe(
      `UPDATE product_registry SET
         anvisa_matched_product_name = COALESCE($2, anvisa_matched_product_name),
         anvisa_holder = COALESCE($3, anvisa_holder),
         anvisa_status = COALESCE($4, anvisa_status),
         anvisa_expiration = $5,
         anvisa_risk_class = $6,
         anvisa_process = COALESCE($7, anvisa_process),
         anvisa_synced_at = NOW()
       WHERE anvisa_code = $1`,
      code,
      data.nomeProduto,
      data.nomeEmpresa,
      data.situacaoRegistro,
      data.vencimentoRegistro,
      data.classeRisco,
      data.processoRegistro,
    );

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
    console.error('[anvisa/validate] Error:', err);
    return NextResponse.json({ error: 'Erro ao validar registro ANVISA' }, { status: 500 });
  }
}
