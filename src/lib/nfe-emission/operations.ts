import { getCfopTagByCode } from '@/lib/cfop';

const NATUREZA_BY_CFOP: Record<string, string> = {
  '5102': 'Venda merc.adq. ou recb. terc.',
  '6102': 'Venda fora do estado',
  '6108': 'Venda Destinada a Nao Contribu',
  '5917': 'Remessa de consignacao',
  '6917': 'Remessa de consignacao f. est',
  '1918': 'Dev. de merc. rem. em consig.',
  '2918': 'Devolucao de Consignacao',
  '5912': 'Simples Remessa',
  '5554': 'Emprestimo Ativo Imobilizado',
  '1202': 'Devolucao de venda',
  '5910': 'Doacao',
};

const NATUREZA_BY_TAG: Record<string, string> = {
  Venda: 'Venda merc.adq. ou recb. terc.',
  Comodato: 'Remessa em comodato',
  'Ret. Comodato': 'Retorno de comodato',
  Bonificação: 'Bonificacao',
  Amostra: 'Remessa de amostra',
  Demonstração: 'Remessa para demonstracao',
  'Ret. Demonstração': 'Retorno de demonstracao',
  Consignação: 'Remessa de consignacao',
  'Dev. Consig.': 'Dev. de merc. rem. em consig.',
  'Dev. Venda': 'Devolucao de venda',
  'Outras Saídas': 'Outras saidas',
  'Uso Externo Ativo': 'Emprestimo Ativo Imobilizado',
  'Dev. Compra': 'Devolucao de compra',
  'Dev. Ativo Terceiro': 'Devolucao de ativo de terceiro',
  Conserto: 'Remessa para conserto',
};

const EMISSION_CFOPS = [
  '5102', '5405', '5551', '6101', '6102', '6108',
  '5908', '5909', '5910', '5911', '5912', '5917', '5949', '5554',
  '6202', '6554', '6555', '6908', '6912', '6913', '6915', '6917', '6918', '6949',
  '7202',
  '1202', '1918', '2202', '2918',
] as const;

export type NfeSaidaOperation = {
  cfop: string;
  tag: string;
  natureza: string;
  ambito: 'interna' | 'interestadual' | 'exterior';
  featured: boolean;
};

/**
 * Top 5 CFOP nas NF-e emitidas reais (janela de 30 dias até 2026-08-28):
 * 5102, 6102, 5917, 1918, 6917. O catálogo GET não tem agregado de
 * frequência; ranking medido, não inventado.
 */
export const FREQUENT_SAIDA_CFOPS = ['5102', '6102', '5917', '1918', '6917'] as const;

function ambitoFromCfop(cfop: string): NfeSaidaOperation['ambito'] {
  if (cfop.startsWith('1') || cfop.startsWith('5')) return 'interna';
  if (cfop.startsWith('2') || cfop.startsWith('6')) return 'interestadual';
  return 'exterior';
}

function naturezaFor(cfop: string, tag: string): string {
  return NATUREZA_BY_CFOP[cfop] || NATUREZA_BY_TAG[tag] || tag;
}

function buildSaidaOperation(cfop: string, featured: boolean): NfeSaidaOperation {
  const tag = getCfopTagByCode(cfop) || 'Outras Saídas';
  return {
    cfop,
    tag,
    natureza: naturezaFor(cfop, tag),
    ambito: ambitoFromCfop(cfop),
    featured,
  };
}

export function listSaidaOperations(): NfeSaidaOperation[] {
  const frequent = new Set<string>(FREQUENT_SAIDA_CFOPS);
  const featured = FREQUENT_SAIDA_CFOPS.map((cfop) => buildSaidaOperation(cfop, true));
  const rest = EMISSION_CFOPS.filter((cfop) => !frequent.has(cfop))
    .sort((a, b) => Number(a) - Number(b))
    .map((cfop) => buildSaidaOperation(cfop, false));
  return [...featured, ...rest];
}

export function splitSaidaOperationsForDropdown<T extends { featured?: boolean }>(
  ops: T[],
): { featured: T[]; rest: T[] } {
  return {
    featured: ops.filter((op) => op.featured),
    rest: ops.filter((op) => !op.featured),
  };
}

export function getSaidaOperation(cfop: string): NfeSaidaOperation | null {
  return listSaidaOperations().find((op) => op.cfop === cfop) ?? null;
}

export function assertCfopMatchesUfs(cfop: string, emitUf: string, destUf: string): void {
  const op = getSaidaOperation(cfop);
  if (!op) {
    throw new Error('CFOP não é uma operação do catálogo de emissão');
  }
  const same = emitUf.toUpperCase() === destUf.toUpperCase();
  if (same && op.ambito !== 'interna') {
    throw new Error('CFOP interestadual ou de exterior não serve para destinatário na mesma UF');
  }
  if (!same && destUf.toUpperCase() !== 'EX' && op.ambito === 'interna') {
    throw new Error('CFOP interno não serve para destinatário de outra UF');
  }
}

export function idDestFromUfs(emitUf: string, destUf: string): '1' | '2' | '3' {
  if (destUf.toUpperCase() === 'EX') return '3';
  return emitUf.toUpperCase() === destUf.toUpperCase() ? '1' : '2';
}
