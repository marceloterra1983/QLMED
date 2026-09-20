import type { GraphMailMessage, GraphPdfAttachment } from '@/lib/graph-mail-client';
import type { UnimedCgPurchaseOrderStorePort } from './ingest-purchase-order';
import type { UnimedCgWhatsAppTarget } from './whatsapp-notify';

export type UnimedCgMailPort = {
  listMessages(mailbox: string, options?: { signal?: AbortSignal }): Promise<GraphMailMessage[]>;
  getBodyHtml(
    mailbox: string,
    graphMessageId: string,
    options?: { signal?: AbortSignal },
  ): Promise<{ contentType: string; content: string }>;
  listPurchaseOrderMessages?(
    mailbox: string,
    options?: { signal?: AbortSignal },
  ): Promise<GraphMailMessage[]>;
  getPdfAttachments?(
    mailbox: string,
    graphMessageId: string,
    signal?: AbortSignal,
  ): Promise<GraphPdfAttachment[]>;
};

export type UnimedCgDrivePort = {
  uploadPdf(input: { fileName: string; content: Buffer }): Promise<{ itemId: string }>;
  deletePdf?(itemId: string): Promise<void>;
};

export type UnimedCgFetchPort = {
  fetchHtml(url: string): Promise<string>;
  renderPdf(url: string): Promise<Buffer>;
  renderHtmlPdf(html: string): Promise<Buffer>;
};

export type UnimedCgAuthorizationRow = {
  id: string;
  processId: string;
  parseStatus: 'ok' | 'parcial' | 'falha';
  oneDriveItemId: string;
};

export type PersistArgs = {
  companyId: string;
  processId: string;
  authorizationNumber: string | null;
  procedureDate: Date | null;
  patientName: string | null;
  location: string | null;
  totalCents: number;
  parseStatus: 'ok' | 'parcial' | 'falha';
  fileName: string;
  oneDriveItemId: string;
  sourceUrl: string | null;
  receivedAt: Date;
  internetMessageId?: string;
  mailbox?: string;
  graphMessageId?: string;
};

export type PersistDeliveryArgs = {
  companyId: string;
  processId: string;
  principalAuthorization: string | null;
  status: string | null;
  authorizedAt: Date | null;
  patientName: string | null;
  supplier: string | null;
  parseStatus: 'ok' | 'parcial' | 'falha';
  fileName: string;
  oneDriveItemId: string;
  sourceUrl: string | null;
  receivedAt: Date;
  internetMessageId?: string;
  mailbox?: string;
  graphMessageId?: string;
};

export type UnimedCgStorePort = {
  findSourceByInternetMessageId(
    companyId: string,
    internetMessageId: string,
  ): Promise<{ id: string; authorizationId: string | null; whatsappSentAt?: Date | null } | null>;
  findByProcessId(companyId: string, processId: string): Promise<UnimedCgAuthorizationRow | null>;
  persistConfirmed(input: PersistArgs): Promise<{ id: string }>;
  persistUpgrade(input: PersistArgs & { authorizationId: string }): Promise<void>;
  persistSourceOnly(input: {
    companyId: string;
    authorizationId: string;
    mailbox: string;
    graphMessageId: string;
    internetMessageId: string;
    receivedAt: Date;
  }): Promise<void>;
  loadIngestState(companyId: string): Promise<{
    lastSuccessAt: Date | null;
    backfillCompletedAt: Date | null;
    lastError: string | null;
  } | null>;
  saveIngestState(
    companyId: string,
    patch: { lastSuccessAt?: Date | null; backfillCompletedAt?: Date | null; lastError?: string | null },
  ): Promise<void>;
  markWhatsAppSent?(
    companyId: string,
    internetMessageId: string,
    messageId: string | null,
  ): Promise<void>;
};

export type UnimedCgDeliveryStorePort = {
  findSourceByInternetMessageId(
    companyId: string,
    internetMessageId: string,
  ): Promise<{ id: string; authorizationId: string | null; whatsappSentAt?: Date | null } | null>;
  findByProcessId(companyId: string, processId: string): Promise<UnimedCgAuthorizationRow | null>;
  persistConfirmed(input: PersistDeliveryArgs): Promise<{ id: string }>;
  persistUpgrade(input: PersistDeliveryArgs & { authorizationId: string }): Promise<void>;
  persistSourceOnly(input: {
    companyId: string;
    authorizationId: string;
    mailbox: string;
    graphMessageId: string;
    internetMessageId: string;
    receivedAt: Date;
  }): Promise<void>;
  markWhatsAppSent?(
    companyId: string,
    internetMessageId: string,
    messageId: string | null,
  ): Promise<void>;
};


export type PersistReversalArgs = {
  companyId: string;
  processId: string;
  authorizationNumber: string | null;
  procedureDate: Date | null;
  patientName: string | null;
  location: string | null;
  procedureType: string | null;
  parseStatus: 'ok' | 'parcial' | 'falha';
  fileName: string;
  oneDriveItemId: string;
  sourceUrl: string | null;
  receivedAt: Date;
  internetMessageId?: string;
  mailbox?: string;
  graphMessageId?: string;
};

export type PersistPreSolicitationArgs = {
  companyId: string;
  preSolicitationId: string;
  patientName: string | null;
  procedureType: string | null;
  quoteDeadlineDays: number | null;
  parseStatus: 'ok' | 'parcial' | 'falha';
  fileName: string;
  oneDriveItemId: string;
  sourceUrl: string | null;
  receivedAt: Date;
  internetMessageId?: string;
  mailbox?: string;
  graphMessageId?: string;
};

export type PersistInvoiceDeadlineArgs = {
  companyId: string;
  processId: string;
  patientName: string | null;
  parseStatus: 'ok' | 'parcial' | 'falha';
  fileName: string;
  oneDriveItemId: string;
  sourceUrl: string | null;
  receivedAt: Date;
  internetMessageId?: string;
  mailbox?: string;
  graphMessageId?: string;
};

export type UnimedCgReversalStorePort = {
  findSourceByInternetMessageId(
    companyId: string,
    internetMessageId: string,
  ): Promise<{ id: string; reversalId: string | null; whatsappSentAt?: Date | null } | null>;
  findByProcessId(
    companyId: string,
    processId: string,
  ): Promise<(UnimedCgAuthorizationRow & { receivedAt?: Date }) | null>;
  persistConfirmed(input: PersistReversalArgs): Promise<{ id: string }>;
  persistUpgrade(input: PersistReversalArgs & { reversalId: string }): Promise<void>;
  persistSourceOnly(input: {
    companyId: string;
    reversalId: string;
    mailbox: string;
    graphMessageId: string;
    internetMessageId: string;
    receivedAt: Date;
  }): Promise<void>;
  markWhatsAppSent?(
    companyId: string,
    internetMessageId: string,
    messageId: string | null,
  ): Promise<void>;
};

export type UnimedCgPreSolicitationStorePort = {
  findSourceByInternetMessageId(
    companyId: string,
    internetMessageId: string,
  ): Promise<{ id: string; preSolicitationRefId: string | null; whatsappSentAt?: Date | null } | null>;
  findByPreSolicitationId(
    companyId: string,
    preSolicitationId: string,
  ): Promise<{
    id: string;
    preSolicitationId: string;
    parseStatus: 'ok' | 'parcial' | 'falha';
    oneDriveItemId: string;
    receivedAt?: Date;
  } | null>;
  persistConfirmed(input: PersistPreSolicitationArgs): Promise<{ id: string }>;
  persistUpgrade(input: PersistPreSolicitationArgs & { recordId: string }): Promise<void>;
  persistSourceOnly(input: {
    companyId: string;
    recordId: string;
    mailbox: string;
    graphMessageId: string;
    internetMessageId: string;
    receivedAt: Date;
  }): Promise<void>;
  markWhatsAppSent?(
    companyId: string,
    internetMessageId: string,
    messageId: string | null,
  ): Promise<void>;
};

export type UnimedCgInvoiceDeadlineStorePort = {
  findSourceByInternetMessageId(
    companyId: string,
    internetMessageId: string,
  ): Promise<{ id: string; deadlineId: string | null; whatsappSentAt?: Date | null } | null>;
  findByProcessId(
    companyId: string,
    processId: string,
  ): Promise<(UnimedCgAuthorizationRow & { receivedAt?: Date }) | null>;
  persistConfirmed(input: PersistInvoiceDeadlineArgs): Promise<{ id: string }>;
  persistUpgrade(input: PersistInvoiceDeadlineArgs & { deadlineId: string }): Promise<void>;
  persistSourceOnly(input: {
    companyId: string;
    deadlineId: string;
    mailbox: string;
    graphMessageId: string;
    internetMessageId: string;
    receivedAt: Date;
  }): Promise<void>;
  markWhatsAppSent?(
    companyId: string,
    internetMessageId: string,
    messageId: string | null,
  ): Promise<void>;
};

export type UnimedCgIngestResult = {
  ok: boolean;
  busy?: boolean;
  processed: number;
  skipped: number;
  failedUploads: number;
  failedPersists: number;
  failedMailboxes: string[];
  lastCollectedAt: string | null;
};

export type UnimedCgIngestDeps = {
  mail: UnimedCgMailPort;
  drive: UnimedCgDrivePort;
  fetch: UnimedCgFetchPort;
  store: UnimedCgStorePort;
  deliveryStore: UnimedCgDeliveryStorePort;
  reversalStore: UnimedCgReversalStorePort;
  preSolicitationStore: UnimedCgPreSolicitationStorePort;
  invoiceDeadlineStore: UnimedCgInvoiceDeadlineStorePort;
  purchaseOrderStore?: UnimedCgPurchaseOrderStorePort;
  extractPurchaseOrderText?: (pdf: Buffer) => Promise<string>;
  whatsapp?: UnimedCgWhatsAppTarget | null;
};
