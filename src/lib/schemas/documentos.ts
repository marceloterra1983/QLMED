import { z } from 'zod';
import { CERTIDAO_KINDS_ORDER } from '@/lib/documentos/constants';
import { idParamSchema } from '@/lib/schemas/common';

/** Tipos de certidão da tabela (sem `outro`). */
export const documentosKindSchema = z.enum(CERTIDAO_KINDS_ORDER);

export const documentosValidUntilSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'validUntil deve ser YYYY-MM-DD');

export const documentosIdSchema = idParamSchema;

export const documentosPatchSchema = z
  .object({
    validUntil: documentosValidUntilSchema.optional(),
    emitidoEm: documentosValidUntilSchema.nullable().optional(),
    manufacturer: z
      .string()
      .trim()
      .max(200, 'fabricante deve ter no máximo 200 caracteres')
      .nullable()
      .optional()
      .transform((value) => (value === '' ? null : value)),
  })
  .refine(
    (value) =>
      value.validUntil !== undefined ||
      value.emitidoEm !== undefined ||
      value.manufacturer !== undefined,
    {
      message: 'Informe validUntil, emitidoEm e/ou manufacturer',
    },
  );

export const documentosUploadFieldsSchema = z.object({
  kind: documentosKindSchema,
  validUntil: documentosValidUntilSchema,
});
