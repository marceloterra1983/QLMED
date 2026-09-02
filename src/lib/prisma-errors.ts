/**
 * Predicado puro, sem importar o cliente Prisma de propósito: quem precisa
 * distinguir "já existe" de "o banco falhou" costuma estar num `catch` de
 * caminho quente e não pode arrastar a inicialização do cliente junto.
 *
 * P2002 = violação de restrição única (`Unique constraint failed`).
 */
export function isUniqueViolation(error: unknown): boolean {
  return (
    error !== null
    && typeof error === 'object'
    && 'code' in error
    && (error as { code?: unknown }).code === 'P2002'
  );
}
