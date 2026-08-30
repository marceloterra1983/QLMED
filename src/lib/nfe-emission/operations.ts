import { getCfopTagByCode } from '@/lib/cfop';

const NATUREZA_BY_TAG: Record<string, string> = {
  Venda: 'Venda de mercadoria',
  Comodato: 'Remessa em comodato',
  'Ret. Comodato': 'Retorno de comodato',
  Bonificação: 'Bonificacao',
  Amostra: 'Remessa de amostra',
  Demonstração: 'Remessa para demonstracao',
  'Ret. Demonstração': 'Retorno de demonstracao',
  Consignação: 'Remessa em consignacao',
  'Dev. Consig.': 'Devolucao de consignacao',
  'Outras Saídas': 'Outras saidas',
  'Uso Externo Ativo': 'Remessa de bem para uso externo',
  'Dev. Compra': 'Devolucao de compra',
  'Dev. Ativo Terceiro': 'Devolucao de ativo de terceiro',
  Conserto: 'Remessa para conserto',
};

const SAIDA_CFOPS = [
  '5102', '5405', '5551', '6101', '6102', '6108',
  '5908', '5909', '5910', '5911', '5912', '5917', '5949', '5554',
  '6202', '6554', '6555', '6908', '6912', '6913', '6915', '6917', '6918', '6949',
  '7202',
] as const;

export type NfeSaidaOperation = {
  cfop: string;
  tag: string;
  natureza: string;
  ambito: 'interna' | 'interestadual' | 'exterior';
};

function ambitoFromCfop(cfop: string): NfeSaidaOperation['ambito'] {
  if (cfop.startsWith('5')) return 'interna';
  if (cfop.startsWith('6')) return 'interestadual';
  return 'exterior';
}

export function listSaidaOperations(): NfeSaidaOperation[] {
  return SAIDA_CFOPS.map((cfop) => {
    const tag = getCfopTagByCode(cfop) || 'Outras Saídas';
    return {
      cfop,
      tag,
      natureza: NATUREZA_BY_TAG[tag] || tag,
      ambito: ambitoFromCfop(cfop),
    };
  });
}

export function getSaidaOperation(cfop: string): NfeSaidaOperation | null {
  return listSaidaOperations().find((op) => op.cfop === cfop) ?? null;
}

export function assertCfopMatchesUfs(cfop: string, emitUf: string, destUf: string): void {
  const op = getSaidaOperation(cfop);
  if (!op) {
    throw new Error('CFOP não é uma operação de saída do catálogo');
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
