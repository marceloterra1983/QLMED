import { z } from 'zod';

/**
 * Schema para campos nao-arquivo do POST /api/certificate/upload
 * Valida que a senha do certificado PFX/P12 foi informada.
 * A validacao do arquivo (tipo, tamanho) permanece no handler.
 */
export const certificateUploadFieldsSchema = z.object({
  password: z.string().min(1, 'Senha do certificado e obrigatoria'),
});
