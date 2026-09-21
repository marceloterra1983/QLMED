import { z } from 'zod';

const moneyString = z
  .union([z.string(), z.number()])
  .transform((v) => String(v).trim().replace(',', '.'))
  .refine((v) => /^-?\d+(\.\d+)?$/.test(v), 'Valor monetário inválido');

const qtyString = moneyString;

/** `YYYY-MM-DD` civil real — recusa 31/02 e deixa de normalizar para outro dia. */
export const quoteIssuedAtSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida')
  .refine((value) => {
    const [year, month, day] = value.split('-').map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    return (
      parsed.getUTCFullYear() === year
      && parsed.getUTCMonth() === month - 1
      && parsed.getUTCDate() === day
    );
  }, 'Data inválida');

export const quoteItemSchema = z.object({
  productRegistryId: z.string().min(1).max(80).nullable().optional(),
  code: z.string().trim().min(1).max(80),
  description: z.string().trim().min(1).max(500),
  rvs: z.string().trim().max(40).nullable().optional(),
  ncm: z.string().trim().max(12).nullable().optional(),
  unit: z.string().trim().max(10).nullable().optional(),
  quantity: qtyString,
  unitPrice: moneyString,
  discount: moneyString.optional().default('0'),
});

export const quoteUpsertSchema = z.object({
  issuedAt: quoteIssuedAtSchema.optional(),
  customerCnpj: z.string().trim().min(11).max(18),
  customerName: z.string().trim().min(1).max(200),
  customerIe: z.string().trim().max(30).nullable().optional(),
  customerCode: z.string().trim().max(20).nullable().optional(),
  customerStreet: z.string().trim().max(200).nullable().optional(),
  customerNumber: z.string().trim().max(20).nullable().optional(),
  customerDistrict: z.string().trim().max(80).nullable().optional(),
  customerCity: z.string().trim().max(80).nullable().optional(),
  customerState: z.string().trim().max(2).nullable().optional(),
  customerZip: z.string().trim().max(10).nullable().optional(),
  salesperson: z.string().trim().max(80).nullable().optional(),
  patientName: z.string().trim().max(200).nullable().optional(),
  doctorName: z.string().trim().max(200).nullable().optional(),
  convenio: z.string().trim().max(120).nullable().optional(),
  local: z.string().trim().max(200).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  freight: moneyString.optional().default('0'),
  items: z.array(quoteItemSchema).min(1).max(80),
});

export const quoteListQuerySchema = z.object({
  q: z.string().max(200).optional(),
  status: z.enum(['draft', 'issued', 'cancelled']).optional(),
  page: z.coerce.number().int().positive().max(10000).catch(1),
  limit: z.coerce.number().int().positive().max(100).catch(50),
});

export const quoteSearchQuerySchema = z.object({
  q: z.string().max(200).optional(),
  lineStatus: z.enum(['active', 'all']).catch('active'),
  limit: z.coerce.number().int().positive().max(40).catch(20),
});

export type QuoteUpsertInput = z.infer<typeof quoteUpsertSchema>;
