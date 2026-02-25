import { NextResponse } from 'next/server';
import { requireAuth, unauthorizedResponse } from '@/lib/auth';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import {
  getProductRegistryWithAnvisa,
  getProductRegistryByKeys,
  updateRegistryAnvisaData,
  ensureProductRegistryTable,
} from '@/lib/product-registry-store';
import prisma from '@/lib/prisma';

const ANVISA_SAUDE_URL = 'https://consultas.anvisa.gov.br/api/saude/equipamento/';
const ANVISA_MEDS_URL  = 'https://consultas.anvisa.gov.br/api/consulta/medicamentos/registro/';
const DELAY_MS = 300; // between requests to avoid rate-limiting

interface AnvisaRegistryData {
  nomeProduto: string | null;
  nomeEmpresa: string | null;
  processoRegistro: string | null;
  situacaoRegistro: string | null;
  vencimentoRegistro: string | null;
  classeRisco: string | null;
  dataset: 'saude' | 'medicamentos';
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchAnvisaData(registration: string): Promise<AnvisaRegistryData | null> {
  const encoded = encodeURIComponent(registration);

  // Try produtos para saúde first
  try {
    const res = await fetch(
      `${ANVISA_SAUDE_URL}?count=5&filter%5BnumeroRegistro%5D=${encoded}`,
      {
        headers: {
          'Accept': 'application/json, text/plain, */*',
          'User-Agent': 'Mozilla/5.0',
        },
        signal: AbortSignal.timeout(10000),
      },
    );

    if (res.ok) {
      const json = await res.json();
      const items: any[] = json?.content ?? json?.data ?? (Array.isArray(json) ? json : []);
      const item = items.find(
        (i: any) => String(i.numeroRegistro ?? '').replace(/\D/g, '') === registration,
      ) ?? items[0];

      if (item) {
        return {
          nomeProduto: item.nomeProduto ?? item.descricaoProduto ?? null,
          nomeEmpresa: item.nomeEmpresa ?? item.empresa ?? null,
          processoRegistro: item.processoRegistro ?? item.processo ?? null,
          situacaoRegistro: item.situacaoRegistro ?? item.situacao ?? null,
          vencimentoRegistro: item.vencimentoRegistro ?? item.vencimento ?? null,
          classeRisco: item.classeRisco ?? item.classe ?? null,
          dataset: 'saude',
        };
      }
    }
  } catch {
    // fall through to medicamentos
  }

  // Try medicamentos
  try {
    const res = await fetch(
      `${ANVISA_MEDS_URL}?count=5&filter%5BnumeroRegistro%5D=${encoded}`,
      {
        headers: {
          'Accept': 'application/json, text/plain, */*',
          'User-Agent': 'Mozilla/5.0',
        },
        signal: AbortSignal.timeout(10000),
      },
    );

    if (res.ok) {
      const json = await res.json();
      const items: any[] = json?.content ?? json?.data ?? (Array.isArray(json) ? json : []);
      const item = items.find(
        (i: any) => String(i.numeroRegistro ?? '').replace(/\D/g, '') === registration,
      ) ?? items[0];

      if (item) {
        return {
          nomeProduto: item.nomeProduto ?? item.produto ?? null,
          nomeEmpresa: item.nomeEmpresa ?? item.empresa ?? null,
          processoRegistro: item.processoRegistro ?? item.processo ?? null,
          situacaoRegistro: item.situacaoRegistro ?? item.situacao ?? null,
          vencimentoRegistro: item.vencimentoRegistro ?? item.vencimento ?? null,
          classeRisco: null,
          dataset: 'medicamentos',
        };
      }
    }
  } catch {
    // not found in either
  }

  return null;
}

export async function POST(req: Request) {
  let userId: string;
  try {
    userId = await requireAuth();
  } catch {
    return unauthorizedResponse();
  }

  const company = await getOrCreateSingleCompany(userId);
  await ensureProductRegistryTable();

  const body = await req.json().catch(() => ({}));
  // mode: 'all' | 'selected'
  // productKeys?: string[]  — used when mode is 'selected'
  const mode: string = body?.mode ?? 'all';
  const requestedKeys: string[] = Array.isArray(body?.productKeys) ? body.productKeys : [];

  let rows = mode === 'selected' && requestedKeys.length > 0
    ? await getProductRegistryByKeys(company.id, requestedKeys)
    : await getProductRegistryWithAnvisa(company.id);

  // Only process rows that have an ANVISA code
  rows = rows.filter((r) => r.anvisaCode);

  if (rows.length === 0) {
    return NextResponse.json({ ok: true, synced: 0, failed: 0, notFound: 0 });
  }

  // Deduplicate by ANVISA code — fetch each code once and apply to all matching rows
  const codeToRows = new Map<string, typeof rows>();
  for (const row of rows) {
    const code = row.anvisaCode!;
    const list = codeToRows.get(code) ?? [];
    list.push(row);
    codeToRows.set(code, list);
  }

  let synced = 0, failed = 0, notFound = 0;

  const codes = Array.from(codeToRows.keys());

  for (let i = 0; i < codes.length; i++) {
    const code = codes[i];
    const affectedRows = codeToRows.get(code)!;

    if (i > 0) await sleep(DELAY_MS);

    let data: AnvisaRegistryData | null = null;
    try {
      data = await fetchAnvisaData(code);
    } catch {
      failed += affectedRows.length;
      continue;
    }

    if (!data) {
      notFound += affectedRows.length;
      // Still update synced_at so we don't keep retrying unknowns
      for (const row of affectedRows) {
        await updateRegistryAnvisaData(row.id, {
          anvisaMatchedProductName: row.anvisaMatchedProductName,
          anvisaHolder: row.anvisaHolder,
          anvisaProcess: row.anvisaProcess,
          anvisaStatus: row.anvisaStatus ?? 'Não encontrado na ANVISA',
          anvisaExpiration: row.anvisaExpiration,
          anvisaRiskClass: row.anvisaRiskClass,
          anvisaManufacturer: row.anvisaManufacturer ?? null,
          anvisaManufacturerCountry: row.anvisaManufacturerCountry ?? null,
          anvisaSyncedAt: new Date(),
        }).catch(() => {});
      }
      continue;
    }

    for (const row of affectedRows) {
      try {
        await updateRegistryAnvisaData(row.id, {
          anvisaMatchedProductName: data.nomeProduto ?? row.anvisaMatchedProductName,
          anvisaHolder: data.nomeEmpresa ?? row.anvisaHolder,
          anvisaProcess: data.processoRegistro ?? row.anvisaProcess,
          anvisaStatus: data.situacaoRegistro ?? row.anvisaStatus,
          anvisaExpiration: data.vencimentoRegistro ?? null,
          anvisaRiskClass: data.classeRisco ?? null,
          anvisaManufacturer: (data as unknown as Record<string, unknown>).nomeFabricante as string ?? row.anvisaManufacturer ?? null,
          anvisaManufacturerCountry: (data as unknown as Record<string, unknown>).paisFabricante as string ?? row.anvisaManufacturerCountry ?? null,
          anvisaSyncedAt: new Date(),
        });
        synced++;
      } catch {
        failed++;
      }
    }
  }

  return NextResponse.json({ ok: true, synced, failed, notFound, total: rows.length });
}
