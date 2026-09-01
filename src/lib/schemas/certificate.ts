import { z } from 'zod';

/**
 * Schema para campos nao-arquivo do POST /api/certificate/upload
 * Valida que a senha do certificado PFX/P12 foi informada.
 * A validacao do arquivo (tipo, tamanho) permanece no handler.
 */
export const certificateUploadFieldsSchema = z.object({
  password: z.string().min(1, 'Senha do certificado e obrigatoria'),
  // Ambiente explícito no upload (FILE-007). Ausente = production, que é o
  // default do schema; o que não pode é um valor fora do enum virar production
  // em silêncio.
  environment: z.enum(['homologation', 'production']).nullish(),
});

export const certificateEnvironmentSchema = z.object({
  environment: z.enum(['homologation', 'production']),
});
