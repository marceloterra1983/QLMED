import type { GraphMailMessage, GraphPdfAttachment } from '@/lib/graph-mail-client';
import { UNIMED_CG_MAILBOXES } from './constants';
import { shouldUpgrade } from './parse-page';
import {
  buildPurchaseOrderFileName,
  extractOrderNumberFromSubject,
  isUnimedCgPurchaseOrderSubject,
  parsePurchaseOrderText,
  type ParsedUnimedCgPurchaseOrder,
} from './parse-purchase-order';
import {
  isWithinUnimedCgNotifyWindow,
  notifyUnimedCgPurchaseOrder,
  type UnimedCgWhatsAppTarget,
} from './whatsapp-notify';

export type UnimedCgPurchaseOrderRow = {
  id: string;
  orderNumber: string;
  parseStatus: 'ok' | 'parcial' | 'falha';
  oneDriveItemId: string;
};

export type PersistPurchaseOrderArgs = {
  companyId: string;
  orderNumber: string;
  requestNumber: string | null;
  orderDate: Date | null;
  billingCnpj: string | null;
  buyerName: string | null;
  paymentTerms: string | null;
  paymentTermsCode: string | null;
  deliveryFrom: Date | null;
  deliveryTo: Date | null;
  supplierName: string | null;
  supplierCnpj: string | null;
  totalAmount: string;
  items: ParsedUnimedCgPurchaseOrder['items'];
  parseStatus: 'ok' | 'parcial' | 'falha';
  fileName: string;
  oneDriveItemId: string;
  receivedAt: Date;
  internetMessageId?: string;
  mailbox?: string;
  graphMessageId?: string;
};

export type UnimedCgPurchaseOrderStorePort = {
  findSourceByInternetMessageId(
    companyId: string,
    internetMessageId: string,
  ): Promise<{ id: string; purchaseOrderId: string | null; whatsappSentAt?: Date | null } | null>;
  findByOrderNumber(companyId: string, orderNumber: string): Promise<UnimedCgPurchaseOrderRow | null>;
  persistConfirmed(input: PersistPurchaseOrderArgs): Promise<{ id: string }>;
  persistUpgrade(input: PersistPurchaseOrderArgs & { purchaseOrderId: string }): Promise<void>;
  persistSourceOnly(input: {
    companyId: string;
    purchaseOrderId: string;
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

export type UnimedCgPurchaseOrderMailPort = {
  listPurchaseOrderMessages(
    mailbox: string,
    options?: { signal?: AbortSignal },
  ): Promise<GraphMailMessage[]>;
  getPdfAttachments(
    mailbox: string,
    graphMessageId: string,
    signal?: AbortSignal,
  ): Promise<GraphPdfAttachment[]>;
};

type Counters = {
  processed: number;
  skipped: number;
  failedUploads: number;
  failedPersists: number;
  errors: string[];
};

function notifyFields(parsed: ParsedUnimedCgPurchaseOrder) {
  return {
    orderNumber: parsed.orderNumber,
    items: parsed.items.map((item) => ({
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      lineTotal: item.lineTotal,
    })),
    totalAmount: parsed.totalAmount,
    billingCnpj: parsed.billingCnpj,
    paymentTerms: parsed.paymentTerms,
  };
}

export async function ingestUnimedCgPurchaseOrders(input: {
  companyId: string;
  mail: UnimedCgPurchaseOrderMailPort;
  uploadPdf: (args: { fileName: string; content: Buffer }) => Promise<{ itemId: string }>;
  deletePdf?: (itemId: string) => Promise<void>;
  store: UnimedCgPurchaseOrderStorePort;
  extractText: (pdf: Buffer) => Promise<string>;
  sanitizeError: (message: string) => string;
  collectOrphanUpload: (itemId: string, referencedItemId: string | null) => Promise<void>;
  counters: Counters;
  logWarn: (msg: string) => void;
  whatsapp?: UnimedCgWhatsAppTarget | null;
}): Promise<void> {
  const notifyAttempted = new Set<string>();

  const notifyWhatsApp = async (args: {
    internetMessageId: string;
    receivedAt: Date;
    fileName: string;
    content: Buffer;
    parsed: ParsedUnimedCgPurchaseOrder;
  }) => {
    if (!input.whatsapp || !input.store.markWhatsAppSent) return;
    if (!isWithinUnimedCgNotifyWindow(args.receivedAt)) return;
    if (notifyAttempted.has(args.internetMessageId)) return;
    notifyAttempted.add(args.internetMessageId);

    const result = await notifyUnimedCgPurchaseOrder({
      target: input.whatsapp,
      fields: notifyFields(args.parsed),
      fileName: args.fileName,
      content: args.content,
    });
    if (!result.sent) {
      input.counters.errors.push('aviso WhatsApp falhou');
      return;
    }
    await input.store.markWhatsAppSent(
      input.companyId,
      args.internetMessageId,
      result.messageId,
    );
  };

  for (const mailbox of UNIMED_CG_MAILBOXES) {
    let messages: GraphMailMessage[] = [];
    try {
      messages = await input.mail.listPurchaseOrderMessages(mailbox, {});
    } catch (error) {
      input.counters.errors.push(
        input.sanitizeError(error instanceof Error ? error.message : 'caixa OC'),
      );
      input.logWarn('unimed_cg_oc_mailbox_failed');
      continue;
    }

    for (const message of messages) {
      if (!isUnimedCgPurchaseOrderSubject(message.subject)) {
        input.counters.skipped += 1;
        continue;
      }

      const existingSource = await input.store.findSourceByInternetMessageId(
        input.companyId,
        message.internetMessageId,
      );
      const retryNotification = Boolean(
        existingSource
        && !existingSource.whatsappSentAt
        && input.whatsapp
        && input.store.markWhatsAppSent
        && !notifyAttempted.has(message.internetMessageId)
        && isWithinUnimedCgNotifyWindow(message.receivedAt),
      );
      if (existingSource && !retryNotification) {
        input.counters.skipped += 1;
        continue;
      }

      let pdfs: GraphPdfAttachment[] = [];
      try {
        pdfs = await input.mail.getPdfAttachments(mailbox, message.graphMessageId);
      } catch (error) {
        input.counters.errors.push(
          input.sanitizeError(error instanceof Error ? error.message : 'anexo OC'),
        );
        input.logWarn('unimed_cg_oc_attachment_failed');
        continue;
      }

      const pdf = pdfs[0];
      if (!pdf) {
        input.counters.skipped += 1;
        continue;
      }

      let text = '';
      try {
        text = await input.extractText(pdf.content);
      } catch (error) {
        input.counters.errors.push(
          input.sanitizeError(error instanceof Error ? error.message : 'ocr OC'),
        );
        input.logWarn('unimed_cg_oc_extract_failed');
        continue;
      }

      const subjectOrder = extractOrderNumberFromSubject(message.subject);
      const parsed = parsePurchaseOrderText(text, subjectOrder);
      if (!parsed.orderNumber) {
        input.counters.skipped += 1;
        continue;
      }

      const fileName = buildPurchaseOrderFileName(parsed.orderNumber);

      if (existingSource) {
        await notifyWhatsApp({
          internetMessageId: message.internetMessageId,
          receivedAt: message.receivedAt,
          fileName,
          content: pdf.content,
          parsed,
        });
        input.counters.skipped += 1;
        continue;
      }

      const existing = await input.store.findByOrderNumber(input.companyId, parsed.orderNumber);
      const upgrades = existing ? shouldUpgrade(existing.parseStatus, parsed.parseStatus) : false;
      if (existing && !upgrades) {
        try {
          await input.store.persistSourceOnly({
            companyId: input.companyId,
            purchaseOrderId: existing.id,
            mailbox,
            graphMessageId: message.graphMessageId,
            internetMessageId: message.internetMessageId,
            receivedAt: message.receivedAt,
          });
        } catch (error) {
          input.counters.failedPersists += 1;
          input.counters.errors.push(
            input.sanitizeError(error instanceof Error ? error.message : 'origem OC'),
          );
          continue;
        }
        input.counters.skipped += 1;
        continue;
      }

      let itemId: string;
      try {
        const uploaded = await input.uploadPdf({ fileName, content: pdf.content });
        itemId = uploaded.itemId;
      } catch (error) {
        input.counters.failedUploads += 1;
        input.counters.errors.push(
          input.sanitizeError(error instanceof Error ? error.message : 'upload OC'),
        );
        input.logWarn('unimed_cg_oc_upload_failed');
        continue;
      }

      const persistBase: PersistPurchaseOrderArgs = {
        companyId: input.companyId,
        orderNumber: parsed.orderNumber,
        requestNumber: parsed.requestNumber,
        orderDate: parsed.orderDate,
        billingCnpj: parsed.billingCnpj,
        buyerName: parsed.buyerName,
        paymentTerms: parsed.paymentTerms,
        paymentTermsCode: parsed.paymentTermsCode,
        deliveryFrom: parsed.deliveryFrom,
        deliveryTo: parsed.deliveryTo,
        supplierName: parsed.supplierName,
        supplierCnpj: parsed.supplierCnpj,
        totalAmount: parsed.totalAmount,
        items: parsed.items,
        parseStatus: parsed.parseStatus,
        fileName,
        oneDriveItemId: itemId,
        receivedAt: message.receivedAt,
        internetMessageId: message.internetMessageId,
        mailbox,
        graphMessageId: message.graphMessageId,
      };

      try {
        if (existing) {
          await input.store.persistUpgrade({ ...persistBase, purchaseOrderId: existing.id });
        } else {
          await input.store.persistConfirmed(persistBase);
        }
      } catch (error) {
        input.counters.failedPersists += 1;
        input.counters.errors.push(
          input.sanitizeError(error instanceof Error ? error.message : 'persistência OC'),
        );
        input.logWarn('unimed_cg_oc_persist_failed');
        await input.collectOrphanUpload(itemId, existing?.oneDriveItemId ?? null);
        continue;
      }

      input.counters.processed += 1;
      await notifyWhatsApp({
        internetMessageId: message.internetMessageId,
        receivedAt: message.receivedAt,
        fileName,
        content: pdf.content,
        parsed,
      });
    }
  }
}
