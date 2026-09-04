import type { CompanyDocumentKind } from '@prisma/client';

/**
 * SPEC-042 — contrato da ingestão de certidões (OneDrive → CompanyDocument).
 *
 * Este ficheiro nasce como CONTRATO para permitir que a folha L5 (rotas) e a
 * folha L4 (ingestão) avancem em paralelo em worktrees separados. A L4
 * substitui os corpos; a L5 só importa daqui e nunca edita este ficheiro.
 */

export type DocumentosFolderFile = {
  itemId: string;
  name: string;
  size: number | null;
  lastModifiedAt: Date | null;
};

export type DocumentosFolderPort = {
  /** Lista os PDFs diretos de uma subpasta de DOCUMENTOS_ONEDRIVE_ROOT. */
  listPdfs(folderName: string): Promise<DocumentosFolderFile[]>;
  downloadPdf(itemId: string): Promise<Buffer>;
};

/** Documento novo cuja validade supera a do vigente anterior do mesmo tipo. */
export type RenewalEvent = {
  companyId: string;
  kind: CompanyDocumentKind;
  documentId: string;
  previousValidUntil: string | null;
  validUntil: string;
};

export type DocumentosIngestResult = {
  scanned: number;
  upserted: number;
  removed: number;
  renewals: RenewalEvent[];
};

/** Outra ingestão já detém o advisory lock desta empresa. Rotas respondem 409. */
export class DocumentosIngestBusyError extends Error {
  constructor() {
    super('ingestão de documentos já em curso');
    this.name = 'DocumentosIngestBusyError';
  }
}

export async function runDocumentosIngest(
  companyId: string,
  port?: DocumentosFolderPort,
  now: Date = new Date(),
): Promise<DocumentosIngestResult> {
  void companyId;
  void port;
  void now;
  throw new Error('SPEC-042 L4: runDocumentosIngest ainda não implementado');
}

/** Registrado no bootstrap pela L4; respeita QLMED_DISABLE_BACKGROUND_SERVICES. */
export function startDocumentosIngest(): void {}
