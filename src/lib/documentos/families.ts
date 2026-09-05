import type { CompanyDocumentKind } from '@prisma/client';

export type DocumentosCategory = 'certidao' | 'sanitaria' | 'carta' | 'societario' | 'basicos' | 'balanco';
export type DocumentosFamilyMode = 'closed' | 'open';
export type DocumentosScan = 'subfolders' | 'root' | 'yearFolders';
/** Emissão comprovada — a tag diz o que foi provado, não o que se espera. */
export type DocumentosAutomacao = 'automatica' | 'assistida' | 'manual';

export type DocumentosKindConfig = {
  kind: CompanyDocumentKind;
  label: string;
  /**
   * false: o documento não tem validade operacional. Sem contador, sem alerta,
   * sem arquivamento por vencimento. A AFE é o caso: é consulta ao cadastro
   * da ANVISA ("Situação: Ativo"), não certificado com data de validade.
   */
  expira: boolean;
  /**
   * Como a emissão foi comprovada. Ausente quando `expira: false` — não há
   * emissão periódica a automatizar, e a tabela não mostra tag.
   */
  automacao?: DocumentosAutomacao;
  /**
   * false: a ingestão não grava a data do nome (AFE: data da consulta, não
   * validade). Independente de `expira`. Omissão = grava quando o nome tem data.
   */
  filenameDate?: boolean;
  /** Subpasta sob `root` quando scan='subfolders'. */
  folder?: string;
  uploadName?: (ddMMyy: string) => string;
  emissaoUrl?: string;
  emissaoAria?: string;
  /** Uma ou duas frases: o que o documento é e para que serve. */
  descricao: string;
  /** Órgão que emite ou a quem recorrer para renovar. */
  orgao: string;
};

export type DocumentosFamily = {
  category: DocumentosCategory;
  label: string;
  icon: string;
  root: string;
  archiveFolder: string;
  mode: DocumentosFamilyMode;
  scan: DocumentosScan;
  defaultOpen: boolean;
  columnLabel: string;
  thresholds: readonly number[];
  kinds: readonly DocumentosKindConfig[];
};

const CERTIDAO_KINDS: readonly DocumentosKindConfig[] = [
  {
    kind: 'cnd_federal',
    label: 'CND Receita Federal',
    expira: true,
    automacao: 'manual',
    folder: 'Federais',
    uploadName: (d) => `CERTIDAO RECEITA FEDERAL ${d} - QL MED.pdf`,
    emissaoUrl: 'https://servicos.receitafederal.gov.br/servico/certidoes',
    emissaoAria: 'Emitir CND Receita Federal no site da Receita',
    descricao:
      'Prova que a empresa não tem dívidas com a Receita Federal nem com a Procuradoria-Geral da Fazenda Nacional. Exigida em licitações e em cadastros de fornecedor.',
    orgao: 'Receita Federal do Brasil',
  },
  {
    kind: 'crf_fgts',
    label: 'CRF FGTS',
    expira: true,
    automacao: 'automatica',
    folder: 'FGTS',
    uploadName: (d) => `CERTIDÃO FGTS ${d} QL MED.pdf`,
    emissaoUrl: 'https://consulta-crf.caixa.gov.br/consultacrf/pages/consultaEmpregador.jsf',
    emissaoAria: 'Emitir CRF FGTS no site da Caixa',
    descricao:
      'Certificado de Regularidade do FGTS. Prova que os depósitos de FGTS dos funcionários estão em dia.',
    orgao: 'Caixa Econômica Federal',
  },
  {
    kind: 'cndt',
    label: 'CNDT (Débitos Trabalhistas)',
    expira: true,
    automacao: 'manual',
    folder: 'Débitos Trabalhistas',
    uploadName: (d) => `CERTIDÃO DEBITOS TRABALHISTA ${d}.pdf`,
    emissaoUrl: 'https://cndt-certidao.tst.jus.br/gerarCertidao',
    emissaoAria: 'Emitir CNDT no site do TST',
    descricao:
      'Certidão Negativa de Débitos Trabalhistas. Prova que a empresa não tem condenações trabalhistas inscritas na dívida. Exigida em licitações.',
    orgao: 'Tribunal Superior do Trabalho',
  },
  {
    kind: 'cnd_estadual_ms',
    label: 'CND Estadual (MS)',
    expira: true,
    automacao: 'manual',
    folder: 'Estaduais',
    uploadName: (d) => `CERTIDAO ESTADUAL ${d} QL MED.pdf`,
    emissaoUrl: 'https://servicos.efazenda.ms.gov.br/pndfis/Home/Emissao',
    emissaoAria: 'Emitir CND Estadual (MS) no site da SEFAZ-MS',
    descricao:
      'Prova que a empresa não tem débitos de ICMS inscritos na dívida ativa do Estado de Mato Grosso do Sul.',
    orgao: 'SEFAZ-MS',
  },
  {
    kind: 'cnd_estadual_mt',
    label: 'CND Estadual (MT)',
    expira: true,
    automacao: 'manual',
    folder: 'Estaduais',
    uploadName: (d) => `CERTIDÃO ESTADUAL DO MATO GROSSO ${d}.pdf`,
    emissaoUrl: 'https://www.sefaz.mt.gov.br/cnd/certidao/servlet/ServletRotdAberto?origem=60',
    emissaoAria: 'Emitir CND Estadual (MT) no site da SEFAZ-MT',
    descricao:
      'Prova que a empresa não tem débitos de ICMS inscritos na dívida ativa do Estado de Mato Grosso.',
    orgao: 'SEFAZ-MT',
  },
  {
    kind: 'cnd_municipal_mobiliario',
    label: 'CND Municipal — mobiliário',
    expira: true,
    automacao: 'assistida',
    folder: 'Municipais',
    uploadName: (d) => `CERTIDAO NEGATIVA DE DEBITOS MOBILIARIO ${d}.pdf`,
    emissaoUrl: 'https://siatportal.campogrande.ms.gov.br/servicos/cidadao/certidaoMobiliaria',
    emissaoAria: 'Emitir CND Municipal — mobiliário no site da Prefeitura',
    descricao:
      'Certidão negativa de ISS e demais tributos mobiliários do município de Campo Grande. Exigida em licitações e alvará.',
    orgao: 'Prefeitura de Campo Grande',
  },
  {
    kind: 'cnd_municipal_gerais',
    label: 'CND Municipal — débitos gerais',
    expira: true,
    automacao: 'assistida',
    folder: 'Municipais',
    uploadName: (d) => `certidão débitos gerais val. ${d}.pdf`,
    emissaoUrl: 'https://siatportal.campogrande.ms.gov.br/servicos/cidadao/certidao',
    emissaoAria: 'Emitir CND Municipal — débitos gerais no site da Prefeitura',
    descricao:
      'Certidão negativa de débitos gerais junto à Prefeitura de Campo Grande, além do ISS mobiliário.',
    orgao: 'Prefeitura de Campo Grande',
  },
];

const SANITARIA_KINDS: readonly DocumentosKindConfig[] = [
  {
    kind: 'alvara_funcionamento',
    label: 'Alvará de Funcionamento — Prefeitura',
    expira: true,
    automacao: 'manual',
    uploadName: (d) => `ALVARA DE FUNCIONAMENTO PREFEITURA ${d}.pdf`,
    descricao:
      'Alvará de funcionamento da Prefeitura. É o que autoriza a empresa a ocupar e operar no endereço cadastrado.',
    orgao: 'Prefeitura de Campo Grande',
  },
  {
    kind: 'licenca_sanitaria',
    label: 'Alvará/Licença Sanitária',
    expira: true,
    automacao: 'manual',
    uploadName: (d) => `ALVARÁ LICENÇA SANITÁRIA ${d} QL MED.pdf`,
    descricao:
      'Licença sanitária da vigilância municipal. Autoriza o estabelecimento a armazenar e comercializar produtos para saúde.',
    orgao: 'Vigilância Sanitária de Campo Grande',
  },
  {
    kind: 'licenca_sanitaria_veiculo',
    label: 'Licença Sanitária de Veículo',
    expira: true,
    automacao: 'manual',
    uploadName: (d) => `Licença Sanitária Veiculo ${d}.pdf`,
    descricao:
      'Licença sanitária do veículo de transporte. Autoriza o veículo a circular com produtos para saúde.',
    orgao: 'Vigilância Sanitária de Campo Grande',
  },
  {
    kind: 'crf_conselho',
    label: 'CRF — Conselho Regional de Farmácia',
    expira: true,
    automacao: 'manual',
    uploadName: (d) => `CRF ${d}.pdf`,
    descricao:
      'Certidão de Regularidade do Conselho Regional de Farmácia. Prova que a empresa está inscrita e em dia com o CRF.',
    orgao: 'Conselho Regional de Farmácia de Mato Grosso do Sul',
  },
  {
    kind: 'controle_pragas',
    label: 'Controle de Pragas',
    expira: true,
    automacao: 'manual',
    uploadName: (d) => `CONTROLE DE PRAGAS - QL MED ${d}.pdf`,
    descricao:
      'Atestado de controle de pragas urbanas. Comprova que o estabelecimento recebeu o serviço no prazo exigido pela vigilância.',
    orgao: 'Empresa prestadora do serviço de controle de pragas',
  },
  {
    kind: 'afe_anvisa',
    label: 'AFE — Autorização de Funcionamento ANVISA',
    expira: false,
    filenameDate: false,
    emissaoUrl: 'https://consultas.anvisa.gov.br/#/empresas/empresas/',
    emissaoAria: 'Consultar AFE no cadastro da ANVISA',
    descricao:
      'Autorização de Funcionamento da ANVISA. É o que permite a empresa operar com produtos para saúde. NÃO tem validade: o que muda é a situação no cadastro da ANVISA.',
    orgao: 'ANVISA',
  },
];

const CARTA_KINDS: readonly DocumentosKindConfig[] = [
  {
    kind: 'carta_comercializacao',
    label: 'Carta de comercialização',
    expira: true,
    automacao: 'manual',
    descricao:
      'Carta de autorização de comercialização emitida pelo fabricante. Comprova que a QL MED está autorizada a vender aquele produto.',
    orgao: 'Fabricante do produto',
  },
];

const SOCIETARIO_KINDS: readonly DocumentosKindConfig[] = [
  {
    kind: 'contrato_social_constituicao',
    label: 'Contrato Social — Constituição',
    expira: false,
    descricao:
      'Contrato social de constituição. É o ato que criou a empresa na Junta Comercial.',
    orgao: 'Junta Comercial de Mato Grosso do Sul',
  },
  {
    kind: 'contrato_social_alteracao',
    label: 'Contrato Social — Última alteração',
    expira: false,
    descricao:
      'Última alteração do contrato social. Registra mudanças de sócios, capital ou objeto.',
    orgao: 'Junta Comercial de Mato Grosso do Sul',
  },
  {
    kind: 'contrato_social_consolidado',
    label: 'Contrato Social — Consolidado',
    expira: false,
    descricao:
      'Contrato social consolidado. Junta constituição e alterações num único instrumento atualizado.',
    orgao: 'Junta Comercial de Mato Grosso do Sul',
  },
];

const BASICOS_KINDS: readonly DocumentosKindConfig[] = [
  {
    kind: 'cartao_cnpj',
    label: 'Cartão CNPJ',
    expira: false,
    emissaoUrl: 'https://solucoes.receita.fazenda.gov.br/Servicos/cnpjreva/',
    emissaoAria: 'Emitir Cartão CNPJ no site da Receita',
    descricao:
      'Comprovante de inscrição e de situação cadastral no CNPJ. Identifica a empresa perante a Receita Federal.',
    orgao: 'Receita Federal do Brasil',
  },
  {
    kind: 'inscricao_municipal',
    label: 'Inscrição Municipal',
    expira: false,
    descricao:
      'Comprovante de inscrição municipal (ISS) em Campo Grande. É o cadastro da empresa na Prefeitura.',
    orgao: 'Prefeitura de Campo Grande',
  },
  {
    kind: 'inscricao_estadual',
    label: 'Inscrição Estadual',
    expira: false,
    descricao:
      'Comprovante de inscrição estadual (ICMS) em Mato Grosso do Sul. Necessário para operações de circulação de mercadorias.',
    orgao: 'SEFAZ-MS',
  },
  {
    kind: 'siscomex_radar',
    label: 'SISCOMEX RADAR',
    expira: false,
    descricao:
      'Habilitação no SISCOMEX (RADAR). É o que permite a empresa operar no comércio exterior.',
    orgao: 'Receita Federal do Brasil',
  },
  {
    kind: 'cadastro_ecjur',
    label: 'Cadastro e-CJUR',
    expira: false,
    descricao:
      'Cadastro da empresa no e-CJUR. Credencia a peticionar em precatórios e processos da justiça estadual.',
    orgao: 'Tribunal de Justiça de Mato Grosso do Sul',
  },
  {
    kind: 'dados_cadastrais',
    label: 'Dados cadastrais',
    expira: false,
    descricao:
      'Ficha de dados cadastrais da empresa (endereço, sócios, contatos) para cadastros de cliente e licitação.',
    orgao: 'QL MED',
  },
];

const BALANCO_KINDS: readonly DocumentosKindConfig[] = [
  {
    kind: 'balanco_anual',
    label: 'Balanço anual',
    expira: false,
    descricao:
      'Demonstrações contábeis do exercício (balanço patrimonial e DRE). Usado em licitações e análise de crédito.',
    orgao: 'Contabilista da empresa',
  },
];

/**
 * Tabela de famílias. Acrescentar uma quarta família = uma entrada aqui,
 * não um ficheiro novo: ingest/list/alerts/upload/port iteram isto.
 */
export const DOCUMENTOS_FAMILIES: readonly DocumentosFamily[] = [
  {
    category: 'certidao',
    label: 'Certidões',
    icon: 'verified',
    root: '1 - DOCUMENTOS/1 - QL MED/2 - CERTIDÕES',
    archiveFolder: 'Vencidas',
    mode: 'closed',
    scan: 'subfolders',
    defaultOpen: false,
    columnLabel: 'Certidão',
    thresholds: [30, 15, 7, 3, 1, 0],
    kinds: CERTIDAO_KINDS,
  },
  {
    category: 'sanitaria',
    label: 'Autorizações sanitárias',
    icon: 'health_and_safety',
    root: '1 - DOCUMENTOS/1 - QL MED/1 - AUTORIZAÇÃO RELACIONADO A SAUDE',
    archiveFolder: 'Vencidas',
    mode: 'closed',
    scan: 'root',
    defaultOpen: false,
    columnLabel: 'Documento',
    // 60 vem da observação II da Licença Sanitária nº 87858: "A renovação
    // deverá ser requerida até 60 (sessenta) dias antes do término de sua
    // validade". 90 abre a janela; ANVISA/vigilância não devolvem em uma semana.
    thresholds: [90, 60, 30, 15, 7, 0],
    kinds: SANITARIA_KINDS,
  },
  {
    category: 'carta',
    label: 'Cartas de comercialização',
    icon: 'mail',
    root: '1 - DOCUMENTOS/1 - QL MED/7 - CARTA COMERCIALIZAÇÃO',
    archiveFolder: 'Vencidas',
    mode: 'open',
    scan: 'root',
    defaultOpen: false,
    columnLabel: 'Fabricante',
    thresholds: [60, 30, 15, 7],
    kinds: CARTA_KINDS,
  },
  {
    category: 'societario',
    label: 'Contrato social',
    icon: 'contract',
    root: '1 - DOCUMENTOS/1 - QL MED/3 - CONTRATO SOCIAL',
    archiveFolder: 'Vencidos',
    mode: 'closed',
    scan: 'root',
    defaultOpen: false,
    columnLabel: 'Documento',
    thresholds: [],
    kinds: SOCIETARIO_KINDS,
  },
  {
    category: 'basicos',
    label: 'Documentos básicos',
    icon: 'badge',
    root: '1 - DOCUMENTOS/1 - QL MED/0 - DOCUMENTOS BÁSICOS',
    archiveFolder: 'Vencidos',
    mode: 'closed',
    scan: 'root',
    defaultOpen: false,
    columnLabel: 'Documento',
    thresholds: [],
    kinds: BASICOS_KINDS,
  },
  {
    category: 'balanco',
    label: 'Balanços',
    icon: 'account_balance',
    root: '1 - DOCUMENTOS/1 - QL MED/4 - BALANÇOS',
    archiveFolder: 'Vencidos',
    mode: 'closed',
    scan: 'yearFolders',
    defaultOpen: false,
    columnLabel: 'Ano',
    thresholds: [],
    kinds: BALANCO_KINDS,
  },
];

const FAMILY_BY_CATEGORY = new Map(DOCUMENTOS_FAMILIES.map((family) => [family.category, family]));
const KIND_TO_CONFIG = new Map<CompanyDocumentKind, DocumentosKindConfig>();
const KIND_TO_FAMILY = new Map<CompanyDocumentKind, DocumentosFamily>();
for (const family of DOCUMENTOS_FAMILIES) {
  for (const kind of family.kinds) {
    KIND_TO_CONFIG.set(kind.kind, kind);
    KIND_TO_FAMILY.set(kind.kind, family);
  }
}

export function familyByCategory(category: DocumentosCategory): DocumentosFamily {
  const family = FAMILY_BY_CATEGORY.get(category);
  if (!family) throw new Error(`família desconhecida: ${category}`);
  return family;
}

export function familyForKind(kind: CompanyDocumentKind): DocumentosFamily | undefined {
  return KIND_TO_FAMILY.get(kind);
}

export function kindConfig(kind: CompanyDocumentKind): DocumentosKindConfig | undefined {
  return KIND_TO_CONFIG.get(kind);
}

/** Ausência de config (outro) trata-se como expirável; AFE e as famílias L11 são false. */
export function kindExpires(kind: CompanyDocumentKind): boolean {
  return KIND_TO_CONFIG.get(kind)?.expira ?? true;
}

/**
 * Tag na tabela. `expira: false` não tem emissão periódica — sem tag.
 * Omissão em tipo que vence = `manual` (ainda não testado não é automático).
 */
export function automacaoOf(config: DocumentosKindConfig | undefined): DocumentosAutomacao | null {
  if (!config || config.expira === false) return null;
  return config.automacao ?? 'manual';
}

/**
 * Gravar a data extraída do nome. Independente de `expira`: o Cartão CNPJ não
 * vence (sem alerta) mas a vigente é a cópia de maior data. AFE omite
 * (`filenameDate: false`) porque a data no nome é a da consulta.
 */
export function kindStoresFilenameDate(kind: CompanyDocumentKind): boolean {
  return KIND_TO_CONFIG.get(kind)?.filenameDate !== false;
}

function foldKey(value: string): string {
  return value
    .normalize('NFC')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/** Pasta `BALANÇO 2024` — a unidade da família balanço. */
export function balancoYearFromFolderName(name: string): number | null {
  const match = /^balanco\s+(\d{4})$/.exec(foldKey(name));
  if (!match) return null;
  const year = Number(match[1]);
  return year >= 1900 && year <= 2100 ? year : null;
}

/** Ficheiro solto `BALANÇO 2024.zip` / `.pdf` no raiz, só se o ano não tem pasta. */
export function balancoYearFromLooseFile(name: string): number | null {
  const match = /^balanco\s+(\d{4})\.(zip|pdf)$/.exec(foldKey(name));
  if (!match) return null;
  const year = Number(match[1]);
  return year >= 1900 && year <= 2100 ? year : null;
}

export function balancoYearFromName(name: string): number | null {
  return balancoYearFromFolderName(name.replace(/\.(zip|pdf)$/i, '')) ?? balancoYearFromLooseFile(name);
}

export function labelForKind(kind: CompanyDocumentKind): string {
  return KIND_TO_CONFIG.get(kind)?.label ?? 'Outro';
}

export function thresholdsForKind(kind: CompanyDocumentKind): readonly number[] {
  return KIND_TO_FAMILY.get(kind)?.thresholds ?? familyByCategory('certidao').thresholds;
}

export function closedKindsOf(family: DocumentosFamily): CompanyDocumentKind[] {
  return family.kinds.map((kind) => kind.kind);
}

export function lastPathSegment(path: string): string {
  return path.split('/').map((part) => part.trim()).filter(Boolean).at(-1) ?? path;
}

export type FamilyScanTarget = { folderName: string; path: string };

export function familyScanTargets(family: DocumentosFamily): FamilyScanTarget[] {
  if (family.scan === 'root' || family.scan === 'yearFolders') {
    return [{ folderName: lastPathSegment(family.root), path: family.root }];
  }
  const seen = new Set<string>();
  const targets: FamilyScanTarget[] = [];
  for (const kind of family.kinds) {
    if (!kind.folder || seen.has(kind.folder)) continue;
    seen.add(kind.folder);
    targets.push({ folderName: kind.folder, path: `${family.root}/${kind.folder}` });
  }
  return targets;
}

export function uploadFolderPath(kind: CompanyDocumentKind): { root: string; folderName: string; path: string } | null {
  const family = KIND_TO_FAMILY.get(kind);
  const config = KIND_TO_CONFIG.get(kind);
  if (!family || !config) return null;
  const folderName = config.folder ?? lastPathSegment(family.root);
  const path = config.folder ? `${family.root}/${config.folder}` : family.root;
  return { root: family.root, folderName, path };
}
