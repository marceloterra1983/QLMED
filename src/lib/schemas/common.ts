import { z } from 'zod';

/**
 * Schema para companyId — usado por quase todas as rotas.
 * Garante que companyId e uma string nao vazia.
 */
export const companyIdSchema = z.object({
  companyId: z.string().min(1, 'companyId e obrigatorio'),
});

/**
 * Schema de paginacao com defaults sensatos.
 * page e limit sao coerced de string (query params) para number.
 * Limite maximo de 500 registros por pagina.
 */
export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(500).default(50),
});

/**
 * Schema de intervalo de datas (ISO 8601).
 * Ambas as datas sao opcionais — permite busca aberta.
 */
export const dateRangeSchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

/**
 * Schema de CNPJ — valida formato de 14 digitos numericos.
 * Nao valida digito verificador (responsabilidade da Receita).
 */
export const cnpjSchema = z.string().regex(/^\d{14}$/, 'CNPJ deve ter 14 digitos');

/**
 * Schema de busca com companyId obrigatorio.
 * Usado em rotas de listagem com campo de pesquisa.
 */
export const searchSchema = z.object({
  search: z.string().optional(),
  companyId: z.string().min(1, 'companyId e obrigatorio'),
});

/**
 * Schema para parametro de ID em rotas dinamicas.
 * Garante que id e uma string nao vazia.
 */
export const idParamSchema = z.object({
  id: z.string().min(1, 'id e obrigatorio'),
});

/**
 * Namespace com todos os schemas para import conveniente.
 * Uso: import { schemas } from '@/lib/schemas/common';
 *      schemas.companyId.parse(data);
 */
export const schemas = {
  companyId: companyIdSchema,
  pagination: paginationSchema,
  dateRange: dateRangeSchema,
  cnpj: cnpjSchema,
  search: searchSchema,
  idParam: idParamSchema,
} as const;
