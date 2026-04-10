export const ANVISA_SAUDE_URL = 'https://consultas.anvisa.gov.br/api/saude/equipamento/';
export const ANVISA_MEDS_URL = 'https://consultas.anvisa.gov.br/api/consulta/medicamentos/registro/';

export interface AnvisaRegistryData {
  nomeProduto: string | null;
  nomeEmpresa: string | null;
  processoRegistro: string | null;
  situacaoRegistro: string | null;
  vencimentoRegistro: string | null;
  classeRisco: string | null;
  dataset: 'saude' | 'medicamentos';
}

interface AnvisaApiItem {
  numeroRegistro?: string;
  nomeProduto?: string;
  descricaoProduto?: string;
  nomeEmpresa?: string;
  empresa?: string;
  processoRegistro?: string;
  processo?: string;
  situacaoRegistro?: string;
  situacao?: string;
  vencimentoRegistro?: string;
  vencimento?: string;
  classeRisco?: string;
  classe?: string;
  produto?: string;
}

export async function fetchAnvisaData(registration: string): Promise<AnvisaRegistryData | null> {
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
      const items: AnvisaApiItem[] = json?.content ?? json?.data ?? (Array.isArray(json) ? json : []);
      const item = items.find(
        (i) => String(i.numeroRegistro ?? '').replace(/\D/g, '') === registration,
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
      const items: AnvisaApiItem[] = json?.content ?? json?.data ?? (Array.isArray(json) ? json : []);
      const item = items.find(
        (i) => String(i.numeroRegistro ?? '').replace(/\D/g, '') === registration,
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
