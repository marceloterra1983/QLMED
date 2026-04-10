import { z } from 'zod';

/**
 * Schema para POST /api/users (criacao de usuario pelo admin).
 * Password min(6) conforme SEC-06.
 */
export const createUserSchema = z.object({
  name: z.string().min(1, 'Nome e obrigatorio').transform((v) => v.trim()),
  email: z.string().email('Email invalido').transform((v) => v.toLowerCase().trim()),
  password: z.string().min(6, 'Senha deve ter no minimo 6 caracteres'),
  role: z.enum(['admin', 'editor', 'viewer']).default('viewer'),
  phone: z.string().nullable().optional(),
  allowedPages: z.array(z.string()).optional(),
});

/**
 * Schema para PATCH /api/users/[id] (atualizacao de usuario).
 * Todos os campos opcionais. Password min(6) quando informado.
 */
export const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  role: z.enum(['admin', 'editor', 'viewer']).optional(),
  status: z.enum(['pending', 'active', 'inactive', 'rejected']).optional(),
  phone: z.string().nullable().optional(),
  allowedPages: z.array(z.string()).optional(),
  password: z.string().min(6).optional(),
});
