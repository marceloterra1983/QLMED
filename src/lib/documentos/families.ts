import type { CompanyDocumentKind } from '@prisma/client';

export type DocumentosCategory = 'certidao' | 'sanitaria' | 'carta';
export type DocumentosFamilyMode = 'closed' | 'open';
export type DocumentosScan = 'subfolders' | 'root';

export type DocumentosKindConfig = {
  kind: CompanyDocumentKind;
  label: string;
  /**
   * false: o documento não tem validade operacional. Sem contador, sem alerta,
   * sem arquivamento por vencimento. A AFE é o caso: é consulta ao cadastro
   * da ANVISA ("Situação: Ativo"), não certificado com data de validade.
   */
  expira: boolean;
  /** Subpasta sob `root` quando scan='subfolders'. */
  folder?: string;
  uploadName?: (ddMMyy: string) => string;
  emissaoUrl?: string;
  emissaoAria?: string;
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
    folder: 'Federais',
    uploadName: (d) => `CERTIDAO RECEITA FEDERAL ${d} - QL MED.pdf`,
    emissaoUrl: 'https://servicos.receitafederal.gov.br/servico/certidoes',
    emissaoAria: 'Emitir CND Receita Federal no site da Receita',
  },
  {
    kind: 'crf_fgts',
    label: 'CRF FGTS',
    expira: true,
    folder: 'FGTS',
    uploadName: (d) => `CERTIDÃO FGTS ${d} QL MED.pdf`,
    emissaoUrl: 'https://consulta-crf.caixa.gov.br/consultacrf/pages/consultaEmpregador.jsf',
    emissaoAria: 'Emitir CRF FGTS no site da Caixa',
  },
  {
    kind: 'cndt',
    label: 'CNDT (Débitos Trabalhistas)',
    expira: true,
    folder: 'Débitos Trabalhistas',
    uploadName: (d) => `CERTIDÃO DEBITOS TRABALHISTA ${d}.pdf`,
    emissaoUrl: 'https://cndt-certidao.tst.jus.br/gerarCertidao',
    emissaoAria: 'Emitir CNDT no site do TST',
  },
  {
    kind: 'cnd_estadual_ms',
    label: 'CND Estadual (MS)',
    expira: true,
    folder: 'Estaduais',
    uploadName: (d) => `CERTIDAO ESTADUAL ${d} QL MED.pdf`,
    emissaoUrl: 'https://servicos.efazenda.ms.gov.br/pndfis/Home/Emissao',
    emissaoAria: 'Emitir CND Estadual (MS) no site da SEFAZ-MS',
  },
  {
    kind: 'cnd_estadual_mt',
    label: 'CND Estadual (MT)',
    expira: true,
    folder: 'Estaduais',
    uploadName: (d) => `CERTIDÃO ESTADUAL DO MATO GROSSO ${d}.pdf`,
    emissaoUrl: 'https://www.sefaz.mt.gov.br/cnd/certidao/servlet/ServletRotdAberto?origem=60',
    emissaoAria: 'Emitir CND Estadual (MT) no site da SEFAZ-MT',
  },
  {
    kind: 'cnd_municipal_mobiliario',
    label: 'CND Municipal — mobiliário',
    expira: true,
    folder: 'Municipais',
    uploadName: (d) => `CERTIDAO NEGATIVA DE DEBITOS MOBILIARIO ${d}.pdf`,
    emissaoUrl: 'https://siatportal.campogrande.ms.gov.br/servicos/cidadao/certidaoMobiliaria',
    emissaoAria: 'Emitir CND Municipal — mobiliário no site da Prefeitura',
  },
  {
    kind: 'cnd_municipal_gerais',
    label: 'CND Municipal — débitos gerais',
    expira: true,
    folder: 'Municipais',
    uploadName: (d) => `certidão débitos gerais val. ${d}.pdf`,
    emissaoUrl: 'https://siatportal.campogrande.ms.gov.br/servicos/cidadao/certidao',
    emissaoAria: 'Emitir CND Municipal — débitos gerais no site da Prefeitura',
  },
];

const SANITARIA_KINDS: readonly DocumentosKindConfig[] = [
  {
    kind: 'alvara_funcionamento',
    label: 'Alvará de Funcionamento — Prefeitura',
    expira: true,
    uploadName: (d) => `ALVARA DE FUNCIONAMENTO PREFEITURA ${d}.pdf`,
  },
  {
    kind: 'licenca_sanitaria',
    label: 'Alvará/Licença Sanitária',
    expira: true,
    uploadName: (d) => `ALVARÁ LICENÇA SANITÁRIA ${d} QL MED.pdf`,
  },
  {
    kind: 'licenca_sanitaria_veiculo',
    label: 'Licença Sanitária de Veículo',
    expira: true,
    uploadName: (d) => `Licença Sanitária Veiculo ${d}.pdf`,
  },
  {
    kind: 'crf_conselho',
    label: 'CRF — Conselho Regional de Farmácia',
    expira: true,
    uploadName: (d) => `CRF ${d}.pdf`,
  },
  {
    kind: 'controle_pragas',
    label: 'Controle de Pragas',
    expira: true,
    uploadName: (d) => `CONTROLE DE PRAGAS - QL MED ${d}.pdf`,
  },
  {
    kind: 'afe_anvisa',
    label: 'AFE — Autorização de Funcionamento ANVISA',
    expira: false,
  },
];

const CARTA_KINDS: readonly DocumentosKindConfig[] = [
  {
    kind: 'carta_comercializacao',
    label: 'Carta de comercialização',
    expira: true,
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
    defaultOpen: true,
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
    defaultOpen: true,
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

/** Ausência de config (outro) trata-se como expirável; só AFE é false. */
export function kindExpires(kind: CompanyDocumentKind): boolean {
  return KIND_TO_CONFIG.get(kind)?.expira ?? true;
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
  if (family.scan === 'root') {
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
