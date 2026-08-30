import { z } from 'zod';
import { getSaidaOperation } from './operations';

const cnpj = z.string().transform((v) => v.replace(/\D/g, '')).refine((v) => v.length === 14, 'CNPJ inválido');

const itemSchema = z.object({
  productId: z.string().min(1).max(80),
  cProd: z.string().min(1).max(60),
  xProd: z.string().min(1).max(120),
  ncm: z.string().min(8).max(8),
  cfop: z.string().regex(/^\d{4}$/),
  uCom: z.string().min(1).max(6),
  qCom: z.string().regex(/^\d+(\.\d{1,4})?$/),
  vUnCom: z.string().regex(/^\d+(\.\d{1,4})?$/),
  vDesc: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
  ean: z.string().max(14).nullable().optional(),
  cest: z.string().max(7).nullable().optional(),
  anvisa: z.string().max(20).nullable().optional(),
});

export const nfeEmissionPayloadSchema = z.object({
  natureza: z.string().min(1).max(60),
  cfop: z.string().regex(/^\d{4}$/),
  series: z.string().regex(/^\d{1,3}$/),
  destCnpj: cnpj,
  destName: z.string().min(1).max(120).optional(),
  indFinal: z.enum(['0', '1']),
  indPres: z.enum(['0', '1', '2', '3', '4', '5', '9']),
  items: z.array(itemSchema).min(1).max(100),
}).superRefine((value, ctx) => {
  if (!getSaidaOperation(value.cfop)) {
    ctx.addIssue({ code: 'custom', path: ['cfop'], message: 'CFOP fora do catálogo de saídas' });
  }
});

export type NfeEmissionPayload = z.infer<typeof nfeEmissionPayloadSchema>;
