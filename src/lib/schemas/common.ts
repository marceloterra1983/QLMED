import { z } from 'zod';

/**
 * Schema de CNPJ — valida formato de 14 digitos numericos.
 * Nao valida digito verificador (responsabilidade da Receita).
 */
export const cnpjSchema = z.string().regex(/^\d{14}$/, 'CNPJ deve ter 14 digitos');

/**
 * Schema para parametro de ID em rotas dinamicas.
 * Garante que id e uma string nao vazia.
 */
export const idParamSchema = z.object({
  id: z.string().min(1, 'id e obrigatorio'),
});
