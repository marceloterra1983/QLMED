import { z } from 'zod';
import { getSaidaOperation } from './operations';

const cnpj = z.string().transform((v) => v.replace(/\D/g, '')).refine((v) => v.length === 14, 'CNPJ inválido');
const money2 = z.string().regex(/^\d+(\.\d{1,2})?$/);
const money4 = z.string().regex(/^\d+(\.\d{1,4})?$/);

const itemSchema = z.object({
  productId: z.string().min(1).max(80),
  cProd: z.string().min(1).max(60),
  xProd: z.string().min(1).max(120),
  ncm: z.string().min(8).max(8),
  cfop: z.string().regex(/^\d{4}$/),
  uCom: z.string().min(1).max(6),
  qCom: money4,
  vUnCom: money4,
  vDesc: money2.optional(),
  ean: z.string().max(14).nullable().optional(),
  cest: z.string().max(7).nullable().optional(),
  anvisa: z.string().max(20).nullable().optional(),
  orig: z.string().max(1).nullable().optional(),
  csosn: z.string().max(4).nullable().optional(),
  cstIcms: z.string().max(3).nullable().optional(),
  cstPis: z.string().max(2).nullable().optional(),
  cstCofins: z.string().max(2).nullable().optional(),
});

export const nfeEmissionPayloadSchema = z.object({
  natureza: z.string().min(1).max(60),
  cfop: z.string().regex(/^\d{4}$/),
  series: z.string().regex(/^\d{1,3}$/),
  destCnpj: cnpj,
  destName: z.string().min(1).max(120).optional(),
  finNFe: z.enum(['1', '2', '3', '4']).default('1'),
  indFinal: z.enum(['0', '1']),
  indPres: z.enum(['0', '1', '2', '3', '4', '5', '9']),
  modFrete: z.enum(['0', '1', '2', '3', '4', '9']).default('9'),
  vFrete: money2.optional(),
  vSeg: money2.optional(),
  vOutro: money2.optional(),
  transporta: z.object({
    cnpj: z.string().max(14).optional(),
    xNome: z.string().max(60).optional(),
    ie: z.string().max(14).optional(),
    xEnder: z.string().max(60).optional(),
    xMun: z.string().max(60).optional(),
    UF: z.string().max(2).optional(),
  }).optional(),
  volume: z.object({
    qVol: z.string().max(15).optional(),
    esp: z.string().max(60).optional(),
    marca: z.string().max(60).optional(),
    pesoL: money4.optional(),
    pesoB: money4.optional(),
  }).optional(),
  pag: z.object({
    indPag: z.enum(['0', '1']).default('0'),
    tPag: z.string().regex(/^\d{2}$/),
    vPag: money2.optional(),
  }).optional(),
  infCpl: z.string().max(2000).optional(),
  infAdFisco: z.string().max(2000).optional(),
  items: z.array(itemSchema).min(1).max(100),
}).superRefine((value, ctx) => {
  if (!getSaidaOperation(value.cfop)) {
    ctx.addIssue({ code: 'custom', path: ['cfop'], message: 'CFOP fora do catálogo de saídas' });
  }
});

export type NfeEmissionPayload = z.infer<typeof nfeEmissionPayloadSchema>;
