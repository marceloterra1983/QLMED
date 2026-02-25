import { NextResponse } from 'next/server';
import { hash } from 'bcryptjs';
import { requireAdmin, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { VALID_PAGE_PATHS } from '@/lib/navigation';

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    let admin: { userId: string; role: string };
    try {
      admin = await requireAdmin();
    } catch (e: any) {
      if (e.message === 'FORBIDDEN') return forbiddenResponse();
      return unauthorizedResponse();
    }

    const { id } = params;
    const body = await req.json();
    const { name, email, role, status, phone, allowedPages, password } = body;

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

    const validRoles = ['admin', 'editor', 'viewer'];
    if (role && !validRoles.includes(role)) {
      return NextResponse.json({ error: 'Perfil inválido' }, { status: 400 });
    }

    const validStatuses = ['pending', 'active', 'inactive', 'rejected'];
    if (status && !validStatuses.includes(status)) {
      return NextResponse.json({ error: 'Status inválido' }, { status: 400 });
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

    const updateData: any = {};
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

    return NextResponse.json({ user });
  } catch (error) {
    console.error('Error updating user:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
