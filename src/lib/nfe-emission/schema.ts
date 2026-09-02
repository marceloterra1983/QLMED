import { z } from 'zod';
import { DEFAULT_IND_PRES, DEFAULT_SERIES } from './issued-defaults';
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
  // Só dígitos: são códigos da tabela fiscal. Sem isto, `max(n)` deixava passar
  // `<` e `&`, que entram no infNFe assinado e fazem o nosso SHA-1 divergir do
  // que a SEFAZ recalcula sobre a forma canónica C14N.
  orig: z.string().regex(/^\d$/).nullable().optional(),
  csosn: z.string().regex(/^\d{3,4}$/).nullable().optional(),
  cstIcms: z.string().regex(/^\d{2,3}$/).nullable().optional(),
  cstPis: z.string().max(2).nullable().optional(),
  cstCofins: z.string().max(2).nullable().optional(),
  pPis: money4.nullable().optional(),
  pCofins: money4.nullable().optional(),
});

export const nfeEmissionPayloadSchema = z.object({
  natureza: z.string().min(1).max(60),
  cfop: z.string().regex(/^\d{4}$/),
  series: z.coerce.string().pipe(z.literal(DEFAULT_SERIES)).default(DEFAULT_SERIES),
  destCnpj: cnpj,
  destName: z.string().min(1).max(120).optional(),
  finNFe: z.enum(['1', '2', '3', '4']).default('1'),
  indFinal: z.enum(['0', '1']),
  // Emissão QLMED: presença sempre "não presencial — outros" (DNA fiscal).
  // Valor do client é ignorado; notas históricas já emitidas não passam por aqui.
  indPres: z.preprocess(() => DEFAULT_IND_PRES, z.literal(DEFAULT_IND_PRES)),
  modFrete: z.enum(['0', '1', '2', '3', '4', '9']).default('0'),
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
    indPag: z.enum(['0', '1']).default('1'),
    tPag: z.string().regex(/^\d{2}$/),
    vPag: money2.optional(),
  }).optional(),
  infCpl: z.string().max(2000).optional(),
  infAdFisco: z.string().max(2000).optional(),
  items: z.array(itemSchema).min(1).max(100),
}).superRefine((value, ctx) => {
  if (!getSaidaOperation(value.cfop)) {
    ctx.addIssue({ code: 'custom', path: ['cfop'], message: 'CFOP fora do catálogo de emissão' });
  }
});

export type NfeEmissionPayload = z.infer<typeof nfeEmissionPayloadSchema>;
