import { z } from 'zod';

/**
 * Schema para PATCH /api/invoices/[id]
 * Atualiza o status de manifestacao da nota.
 */
export const invoiceUpdateStatusSchema = z.object({
  status: z.enum(['received', 'confirmed', 'rejected'], {
    error: 'Status invalido. Valores aceitos: received, confirmed, rejected',
  }),
});

/**
 * Schema para POST /api/invoices/bulk-download
 * Download em lote de XMLs ou PDFs.
 */
export const invoiceBulkDownloadSchema = z.object({
  ids: z.array(z.string().min(1)).min(1, 'Selecione ao menos um documento'),
  format: z.enum(['xml', 'pdf'], {
    error: 'Formato invalido. Valores aceitos: xml, pdf',
  }),
});

/**
 * Schema para POST /api/invoices/export-xml
 * Exportacao de XMLs para arquivo. Todos os campos sao opcionais com defaults.
 */
export const invoiceExportXmlSchema = z.object({
  years: z.coerce.number().int().positive().max(10).default(5),
  types: z.array(z.enum(['NFE', 'CTE', 'NFSE'])).optional(),
  directions: z.array(z.enum(['received', 'issued'])).optional(),
});
