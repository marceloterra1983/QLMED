import { z } from 'zod';
import { CERTIDAO_KINDS_ORDER } from '@/lib/documentos/constants';
import { idParamSchema } from '@/lib/schemas/common';

/** Tipos de certidão da tabela (sem `outro`). */
export const documentosKindSchema = z.enum(CERTIDAO_KINDS_ORDER);

export const documentosValidUntilSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'validUntil deve ser YYYY-MM-DD');

export const documentosIdSchema = idParamSchema;

export const documentosPatchSchema = z.object({
  validUntil: documentosValidUntilSchema,
});

export const documentosUploadFieldsSchema = z.object({
  kind: documentosKindSchema,
  validUntil: documentosValidUntilSchema,
});
