/**
 * Checklist de pré-envio — bloqueia a ida à SEFAZ se o XML falhar regras
 * que já rejeitaram o QLMED ou que o gabarito SPICA 65248 sempre envia.
 * Fontes: NT 2020.006, NT 2018.005, NT 2025.002, portal NF-e.
 */
import { JOINNER_CNPJ, requiresIndIntermed } from './issued-defaults';

export type PreflightIssue = {
  id: string;
  cStat: string | null;
  field: string;
  message: string;
  source: string;
};

const SRC_NT_2020_006 = 'https://www.nfe.fazenda.gov.br/portal/listaConteudo.aspx?tipoConteudo=04BIflQt1aY=';
const SRC_NT_2018_005 = 'https://www.nfe.fazenda.gov.br/portal/listaConteudo.aspx?tipoConteudo=04BIflQt1aY=';
const SRC_NT_2025_002 = 'https://www.nfe.fazenda.gov.br/portal/listaConteudo.aspx?tipoConteudo=/NJarYc9nus=';
const SRC_MOC = 'http://moc.sped.fazenda.pr.gov.br/NFe_NFCe/Leiaute.html';

function tag(xml: string, name: string): string | null {
  const m = xml.match(new RegExp(`<${name}>([^<]*)</${name}>`));
  return m ? m[1] : null;
}

function has(xml: string, name: string): boolean {
  return new RegExp(`<${name}[\\s>]`).test(xml);
}

export class NfePreflightError extends Error {
  readonly issues: PreflightIssue[];
  readonly primaryStat: string;

  constructor(issues: PreflightIssue[]) {
    const head = issues
      .map((i) => (i.cStat ? `${i.cStat}: ${i.message}` : i.message))
      .join(' · ');
    super(`Pré-envio bloqueado — a nota não foi enviada à SEFAZ. ${head}`);
    this.name = 'NfePreflightError';
    this.issues = issues;
    this.primaryStat = issues.find((i) => i.cStat)?.cStat || '000';
  }
}

export function isNfePreflightError(error: unknown): error is NfePreflightError {
  if (error instanceof NfePreflightError) return true;
  if (error instanceof Error && error.name === 'NfePreflightError') return true;
  if (error && typeof error === 'object' && 'cause' in error) {
    return isNfePreflightError((error as { cause: unknown }).cause);
  }
  return false;
}

export function collectNfePreflightIssues(xml: string): PreflightIssue[] {
  const issues: PreflightIssue[] = [];
  const indPres = tag(xml, 'indPres') || '';
  const finNFe = tag(xml, 'finNFe') || '1';
  const tpNf = tag(xml, 'tpNF') || '1';
  const indIntermed = tag(xml, 'indIntermed');
  const needIntermed = requiresIndIntermed(indPres, tpNf, finNFe);

  if (needIntermed && (indIntermed == null || indIntermed === '')) {
    issues.push({
      id: '434-indintermed',
      cStat: '434',
      field: 'ide.indIntermed',
      message: 'NF-e sem indicativo do intermediador',
      source: SRC_NT_2020_006,
    });
  }
  if (!needIntermed && has(xml, 'indIntermed')) {
    issues.push({
      id: '435-indintermed',
      cStat: '435',
      field: 'ide.indIntermed',
      message: 'NF-e não pode ter o indicativo do intermediador',
      source: SRC_NT_2020_006,
    });
  }
  if (indIntermed === '1' && !has(xml, 'infIntermed')) {
    issues.push({
      id: '438-infintermed',
      cStat: '438',
      field: 'infIntermed',
      message: 'Informado intermediador sem o grupo infIntermed',
      source: SRC_NT_2020_006,
    });
  }
  if (indIntermed !== '1' && has(xml, 'infIntermed')) {
    issues.push({
      id: '439-infintermed',
      cStat: '439',
      field: 'infIntermed',
      message: 'Grupo infIntermed sem indIntermed=1',
      source: SRC_NT_2020_006,
    });
  }

  const respBlock = xml.match(/<infRespTec>[\s\S]*?<\/infRespTec>/)?.[0] || '';
  if (!respBlock || !tag(respBlock, 'CNPJ') || !tag(respBlock, 'xContato') || !tag(respBlock, 'email') || !tag(respBlock, 'fone')) {
    issues.push({
      id: '972-infresptec',
      cStat: '972',
      field: 'infRespTec',
      message: 'Obrigatorias as informacoes do responsavel tecnico',
      source: SRC_NT_2018_005,
    });
  }
  if (respBlock.includes(JOINNER_CNPJ)) {
    issues.push({
      id: '972-joinner',
      cStat: '974',
      field: 'infRespTec.CNPJ',
      message: 'infRespTec nao pode usar o CNPJ da Joinner',
      source: SRC_NT_2018_005,
    });
  }

  if (/<med>/.test(xml) && !/<vPMC>/.test(xml)) {
    issues.push({
      id: '215-med',
      cStat: '215',
      field: 'det.med',
      message: 'Grupo med sem vPMC (XSD 1-1)',
      source: SRC_MOC,
    });
  }

  const pag = xml.match(/<detPag>[\s\S]*?<\/detPag>/)?.[0] || '';
  if (pag.includes('<tPag>90</tPag>') && pag.includes('<indPag>')) {
    issues.push({
      id: 'pag-90-indpag',
      cStat: null,
      field: 'pag.indPag',
      message: 'tPag 90 nao leva indPag (DNA 65082/65248)',
      source: SRC_MOC,
    });
  }

  if (!has(xml, 'vItem')) {
    issues.push({
      id: 'vitem',
      cStat: null,
      field: 'det.vItem',
      message: 'Falta vItem no item (leiaute vigente / DNA 65248)',
      source: SRC_NT_2025_002,
    });
  }
  if (!has(xml, 'vNFTot')) {
    issues.push({
      id: 'vnftot',
      cStat: null,
      field: 'total.vNFTot',
      message: 'Falta vNFTot no total (leiaute vigente / DNA 65248)',
      source: SRC_NT_2025_002,
    });
  }
  if (!has(xml, 'IBSCBS') || !has(xml, 'cClassTrib')) {
    issues.push({
      id: 'ibscbs',
      cStat: null,
      field: 'det.IBSCBS',
      message: 'Falta IBSCBS CST 200 / cClassTrib 200030 (NT 2025.002, DNA 65248)',
      source: SRC_NT_2025_002,
    });
  }

  if (tag(xml, 'tpAmb') === '2') {
    const dest = xml.match(/<dest>[\s\S]*?<\/dest>/)?.[0] || '';
    if (!/NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO/.test(dest)) {
      issues.push({
        id: 'homolog-dest',
        cStat: null,
        field: 'dest.xNome',
        message: 'Homologacao exige a razao social padrao da SEFAZ no destinatario',
        source: SRC_MOC,
      });
    }
  }

  return issues;
}

export function assertNfePreflight(xml: string): void {
  const issues = collectNfePreflightIssues(xml);
  if (issues.length > 0) throw new NfePreflightError(issues);
}
