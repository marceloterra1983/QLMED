import { z } from 'zod';

/**
 * Schema legado para companyId no request.
 * Nao e usado por rotas: company context vem de getOrCreateSingleCompany
 * (usuario autenticado), nunca de companyId controlado pelo cliente.
 * Nao reintroduzir companyId de body/query/params.
 */
export const companyIdSchema = z.object({
  companyId: z.string().min(1, 'companyId e obrigatorio'),
});

/**
 * Schema de paginacao com defaults sensatos.
 * page e limit sao coerced de string (query params) para number.
 * Limite maximo de 500 registros por pagina.
 * Nao e importado por rotas/modulos no momento.
 */
export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(500).default(50),
});

/**
 * Schema de intervalo de datas (ISO 8601).
 * Ambas as datas sao opcionais — permite busca aberta.
 * Nao e importado por rotas/modulos no momento.
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
 * Schema legado de busca com companyId no payload.
 * Nao e usado por rotas de listagem. companyId no request e proibido:
 * isolamento de empresa vem de getOrCreateSingleCompany, nao do cliente.
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
 * Namespace de conveniencia; nenhum modulo importa `schemas` hoje.
 * Preferir imports nomeados (cnpjSchema, idParamSchema). Nao use
 * companyId/search daqui em rotas — company context nao vem do cliente.
 */
export const schemas = {
  companyId: companyIdSchema,
  pagination: paginationSchema,
  dateRange: dateRangeSchema,
  cnpj: cnpjSchema,
  search: searchSchema,
  idParam: idParamSchema,
} as const;
