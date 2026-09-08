/**
 * Diagnóstico operacional de rejeição/retorno SEFAZ a partir de cStat + xMotivo.
 * Não substitui o MOC; dá orientação objetiva ao operador na página Sistema → Emissões.
 */

export type SefazAnalysis = {
  code: string | null;
  title: string;
  summary: string;
  hints: string[];
  severity: 'info' | 'warning' | 'danger' | 'success';
};

const KNOWN: Record<
  string,
  { title: string; summary: string; hints: string[]; severity: SefazAnalysis['severity'] }
> = {
  '100': {
    title: 'Autorizada',
    summary: 'A SEFAZ autorizou o uso da NF-e.',
    hints: [],
    severity: 'success',
  },
  '215': {
    title: 'Falha no esquema XML',
    summary:
      'O XML enviado não passou na validação XSD da SEFAZ (estrutura, ordem ou campo obrigatório ausente).',
    hints: [
      'Se o item tem código ANVISA, o grupo <med> exige cProdANVISA e vPMC juntos.',
      'Confira ordem dos grupos (ide → emit → dest → det → total → transp → pag).',
      'Valide o XML assinado contra o pacote XSD da UF antes de reenviar.',
    ],
    severity: 'danger',
  },
  '204': {
    title: 'Duplicidade de NF-e',
    summary: 'Já existe NF-e com a mesma chave de acesso na SEFAZ.',
    hints: ['Consulte a chave na SEFAZ antes de tentar outro número/série.'],
    severity: 'warning',
  },
  '539': {
    title: 'Duplicidade com diferença na chave',
    summary: 'Número/série já usados com outra chave.',
    hints: ['Ajuste a numeração da série ou recupere o protocolo da nota anterior.'],
    severity: 'warning',
  },
  '297': {
    title: 'Assinatura difere do calculado',
    summary:
      'A SEFAZ recalculou o SignedInfo (C14N 1.0) e a SignatureValue não bate. Quase sempre o XML foi assinado na forma compacta (`/>`) em vez da forma canônica (`<tag></tag>`).',
    hints: [
      'O digest do infNFe pode estar correto — 297 é a assinatura do SignedInfo, não o cStat 280.',
      'Reenvie depois da correção de C14N; não altere o XML após assinar.',
    ],
    severity: 'danger',
  },
  '225': {
    title: 'Falha no Schema XML do lote',
    summary: 'O envelope/lote enviado à autorização falhou no schema.',
    hints: ['Verifique o empacotamento SOAP/NFeAutorizacao4 e a assinatura.'],
    severity: 'danger',
  },
  '434': {
    title: 'Sem indicativo do intermediador',
    summary:
      'indPres 2/3/4/9 em NF-e normal de saída exige <indIntermed> (NT 2020.006). Canal próprio = 0.',
    hints: [
      'QLMED não usa marketplace: indIntermed=0, sem infIntermed.',
      'Não troque indPres só para escapar da tag — a presença tem de ser a real.',
    ],
    severity: 'danger',
  },
  '435': {
    title: 'Indicativo do intermediador indevido',
    summary: 'indIntermed só cabe quando indPres é 2, 3, 4 ou 9.',
    hints: ['Remova indIntermed e infIntermed nesta operação.'],
    severity: 'danger',
  },
  '972': {
    title: 'Responsável técnico obrigatório',
    summary: 'A SEFAZ-MS exige o grupo infRespTec (CNPJ, contato, e-mail e telefone do emissor do software).',
    hints: [
      'O grupo vai ao final da infNFe, depois de infAdic.',
      'Não use o CNPJ da software house antiga (Joinner).',
    ],
    severity: 'danger',
  },
  '656': {
    title: 'Consumo indevido',
    summary: 'A SEFAZ bloqueou temporariamente consultas excessivas (cStat 656).',
    hints: ['Aguarde o cooldown antes de nova tentativa de sync/consulta.'],
    severity: 'warning',
  },
};

function normalizeCode(stat: string | null | undefined): string | null {
  if (stat == null || String(stat).trim() === '') return null;
  const digits = String(stat).replace(/\D/g, '');
  return digits || String(stat).trim();
}

export function analyzeSefazRejection(input: {
  status?: string | null;
  sefazStat?: string | null;
  sefazMotivo?: string | null;
}): SefazAnalysis {
  const code = normalizeCode(input.sefazStat);
  const motivo = (input.sefazMotivo || '').trim();
  const known = code ? KNOWN[code] : undefined;

  if (input.status === 'authorized' || code === '100') {
    return {
      code: code || '100',
      title: known?.title || 'Autorizada',
      summary: known?.summary || 'Nota autorizada pela SEFAZ.',
      hints: [],
      severity: 'success',
    };
  }

  if (input.status === 'draft' && !code && !motivo) {
    return {
      code: null,
      title: 'Rascunho',
      summary: 'Emissão ainda não enviada à SEFAZ.',
      hints: ['Complete o formulário e envie para autorização.'],
      severity: 'info',
    };
  }

  if (input.status === 'submitted' && !motivo) {
    return {
      code,
      title: 'Enviada — aguardando protocolo',
      summary: 'A nota foi transmitida; consulte o protocolo se o status não atualizar.',
      hints: [],
      severity: 'warning',
    };
  }

  if (known) {
    return {
      code,
      title: known.title,
      summary: motivo || known.summary,
      hints: known.hints,
      severity: known.severity,
    };
  }

  if (code || motivo) {
    return {
      code,
      title: code ? `Rejeição SEFAZ ${code}` : 'Retorno SEFAZ',
      summary: motivo || 'A SEFAZ devolveu um status sem mensagem detalhada.',
      hints: [
        'Confira cStat/xMotivo no detalhe e no MOC da UF.',
        'Corrija o motivo apontado e reenvie a partir do rascunho.',
      ],
      severity: input.status === 'rejected' ? 'danger' : 'warning',
    };
  }

  return {
    code: null,
    title: 'Sem retorno SEFAZ',
    summary: 'Ainda não há cStat/xMotivo gravados nesta emissão.',
    hints: [],
    severity: 'info',
  };
}
