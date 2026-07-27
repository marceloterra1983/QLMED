import { z } from 'zod';

/**
 * Schema para GET /api/customers|suppliers (listagem de contatos).
 */
export const contactListQuerySchema = z.object({
  page: z.coerce.number().int().positive().max(10000).catch(1),
  limit: z.coerce.number().int().positive().max(500).catch(50),
  search: z.string().max(200).catch(''),
  sort: z
    .enum([
      'name',
      'cnpj',
      'documents',
      'documentsPrevYear',
      'documentsCurrentYear',
      'value',
      'firstIssue',
      'lastIssue',
      'city',
    ])
    .catch('name'),
  order: z.enum(['asc', 'desc']).catch('desc'),
  exportAll: z.enum(['0', '1']).catch('0'),
});

/**
 * Schema para POST /api/contacts/cnpj-monitor
 * Executa verificacao em lote de CNPJs.
 */
export const cnpjMonitorSchema = z.object({
  batchSize: z.coerce.number().int().positive().max(50).optional().default(10),
});

/**
 * Schema para PUT /api/contacts/nickname
 * Atualiza apelido de um contato.
 */
export const nicknameSchema = z.object({
  cnpj: z.string().min(1, 'CNPJ obrigatorio'),
  shortName: z.string().optional().default(''),
});

/**
 * Schema para PUT /api/contacts/override
 * Atualiza dados de contato sobrescritos.
 */
export const overrideSchema = z.object({
  cnpj: z.string().min(1, 'CNPJ obrigatorio'),
  phone: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  street: z.string().optional().nullable(),
  number: z.string().optional().nullable(),
  complement: z.string().optional().nullable(),
  district: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  state: z.string().optional().nullable(),
  zipCode: z.string().optional().nullable(),
  country: z.string().optional().nullable(),
});
