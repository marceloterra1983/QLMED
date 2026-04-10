import { z } from 'zod';
import { cnpjSchema } from '@/lib/schemas/common';

/**
 * Schema para POST /api/companies (criacao de empresa).
 * Atualmente o QLMED opera em modo empresa unica, mas o schema
 * define a estrutura esperada caso o modo multi-empresa seja ativado.
 */
export const createCompanySchema = z.object({
  razaoSocial: z.string().min(1, 'Razao social e obrigatoria'),
  cnpj: cnpjSchema,
  nomeFantasia: z.string().optional(),
});
