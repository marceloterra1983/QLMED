import { NextResponse } from 'next/server';
import { hash } from 'bcryptjs';
import { requireAdmin, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import prisma from '@/lib/prisma';
import type { AccessLogAction } from '@prisma/client';
import { VALID_PAGE_PATHS } from '@/lib/navigation';
import { apiError, apiValidationError } from '@/lib/api-error';
import { createLogger } from '@/lib/logger';
import { updateUserSchema } from '@/lib/schemas/user';

const log = createLogger('users/:id');

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    let admin: { userId: string; role: string };
    try {
      admin = await requireAdmin();
    } catch (e: unknown) {
      if (e instanceof Error && e.message === 'FORBIDDEN') return forbiddenResponse();
      return unauthorizedResponse();
    }
    const body = await req.json();

    const parsed = updateUserSchema.safeParse(body);
    if (!parsed.success) return apiValidationError(parsed.error);

    const { name, email, role, status, phone, allowedPages, password } = parsed.data;

    // Self-protection: admin cannot demote or deactivate themselves
    if (id === admin.userId) {
      if (role && role !== 'admin') {
        return NextResponse.json(
          { error: 'Não é possível alterar seu próprio perfil' },
          { status: 400 }
        );
      }
      if (status && status !== 'active') {
        return NextResponse.json(
          { error: 'Não é possível desativar sua própria conta' },
          { status: 400 }
        );
      }
    }

    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) {
      return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
    }

    // Check email uniqueness if changing
    if (email && email.toLowerCase().trim() !== target.email) {
      const existing = await prisma.user.findUnique({
        where: { email: email.toLowerCase().trim() },
      });
      if (existing) {
        return NextResponse.json({ error: 'Email já cadastrado' }, { status: 409 });
      }
    }

    if (name !== undefined && !String(name).trim()) {
      return NextResponse.json({ error: 'Nome não pode ser vazio' }, { status: 400 });
    }
    if (email !== undefined && !String(email).trim()) {
      return NextResponse.json({ error: 'Email não pode ser vazio' }, { status: 400 });
    }

    const updateData: Record<string, string | string[] | null> = {};
    if (name !== undefined) updateData.name = String(name).trim();
    if (email !== undefined) updateData.email = String(email).toLowerCase().trim();
    if (role !== undefined) updateData.role = role;
    if (status !== undefined) updateData.status = status;
    if (phone !== undefined) updateData.phone = phone?.trim() || null;
    if (allowedPages !== undefined) {
      if (!Array.isArray(allowedPages) || !allowedPages.every((p: unknown) => typeof p === 'string' && VALID_PAGE_PATHS.has(p))) {
        return NextResponse.json({ error: 'Páginas inválidas' }, { status: 400 });
      }
      updateData.allowedPages = allowedPages;
    }
    if (password !== undefined && password !== '') {
      if (typeof password !== 'string' || password.length < 6) {
        return NextResponse.json({ error: 'Senha deve ter no mínimo 6 caracteres' }, { status: 400 });
      }
      updateData.passwordHash = await hash(password, 12);
    }

    // Auth-sensitive mutations (role, status, allowedPages, password) force
    // an immediate JWT invalidation across all devices: increment tokenVersion
    // so the target's next request fails the session check in requireAuth
    // and they must re-login with the new privileges in effect.
    const auditEvents: Array<{ action: AccessLogAction; path: string }> = [];
    const sensitiveChange =
      (role !== undefined && role !== target.role) ||
      (status !== undefined && status !== target.status) ||
      (allowedPages !== undefined) ||
      (password !== undefined && password !== '');
    if (sensitiveChange) {
      (updateData as { tokenVersion?: { increment: number } }).tokenVersion = { increment: 1 };
    }
    if (role !== undefined && role !== target.role) {
      auditEvents.push({ action: 'role_changed', path: `from=${target.role} to=${role}` });
    }
    if (status !== undefined && status !== target.status) {
      auditEvents.push({ action: 'status_changed', path: `from=${target.status} to=${status}` });
    }
    if (allowedPages !== undefined) {
      auditEvents.push({ action: 'pages_changed', path: `count=${allowedPages.length}` });
    }
    // Always write a generic user_updated for admin traceability, tagged with
    // the acting admin's id so the audit log attributes the change correctly.
    auditEvents.push({ action: 'user_updated', path: `target=${id} by=${admin.userId}` });

    const user = await prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        status: true,
        allowedPages: true,
        createdAt: true,
      },
    });

    // Fire-and-forget audit writes; don't block the response on log storage.
    for (const ev of auditEvents) {
      prisma.accessLog
        .create({ data: { userId: admin.userId, action: ev.action, path: ev.path } })
        .catch((err) => log.warn({ err, action: ev.action }, 'AccessLog write failed'));
    }

    return NextResponse.json({ user });
  } catch (error) {
    return apiError(error, 'users/:id');
  }
}
