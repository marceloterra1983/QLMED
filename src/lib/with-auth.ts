import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import {
  forbiddenResponse,
  requireApiKeyScope,
  requireRole,
  unauthorizedResponse,
  type ApiKeyContext,
} from '@/lib/auth';
import { apiError, apiValidationError } from '@/lib/api-error';

type Role = 'viewer' | 'editor' | 'admin';

export type AuthContext = {
  userId: string;
  role: string;
  apiKey?: ApiKeyContext;
};

type WithAuthOptions =
  | { role: Role; apiKeyScope?: string }
  | { apiKeyScope: string; role?: never };

/**
 * Wrapper de route handler: auth → Zod/apiError padronizados.
 * Elimina o try/catch FORBIDDEN/401 repetido nas rotas.
 */
export function withAuth<TArgs extends unknown[]>(
  options: WithAuthOptions,
  handler: (req: Request, ctx: AuthContext, ...args: TArgs) => Promise<Response>,
): (...args: [Request, ...TArgs]) => Promise<Response> {
  return async (req: Request, ...args: TArgs): Promise<Response> => {
    try {
      let auth: AuthContext;

      if ('apiKeyScope' in options && options.apiKeyScope && !('role' in options && options.role)) {
        const apiKey = await requireApiKeyScope(options.apiKeyScope);
        auth = { userId: apiKey.userId, role: 'admin', apiKey };
      } else {
        const role = ('role' in options && options.role) || 'viewer';
        const session = await requireRole(role);
        auth = { userId: session.userId, role: session.role };
      }

      return await handler(req, auth, ...args);
    } catch (err) {
      if (err instanceof ZodError) return apiValidationError(err);
      if (err instanceof Error) {
        if (err.message === 'NOT_AUTHENTICATED') return unauthorizedResponse();
        if (err.message === 'FORBIDDEN') return forbiddenResponse();
      }
      if (err instanceof NextResponse) return err;
      return apiError(err, 'withAuth');
    }
  };
}
