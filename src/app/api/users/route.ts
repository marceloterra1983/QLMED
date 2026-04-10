import { NextResponse } from 'next/server';
import { hash } from 'bcryptjs';
import { requireAdmin, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { VALID_PAGE_PATHS } from '@/lib/navigation';
import { apiError, apiValidationError } from '@/lib/api-error';
import { createLogger } from '@/lib/logger';
import { createUserSchema } from '@/lib/schemas/user';

const log = createLogger('users');

export async function GET() {
  try {
    try {
      await requireAdmin();
    } catch (e: unknown) {
      if (e instanceof Error && e.message === 'FORBIDDEN') return forbiddenResponse();
      return unauthorizedResponse();
    }

    const users = await prisma.user.findMany({
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
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ users });
  } catch (error) {
    return apiError(error, 'users');
  }
}

export async function POST(req: Request) {
  try {
    try {
      await requireAdmin();
    } catch (e: unknown) {
      if (e instanceof Error && e.message === 'FORBIDDEN') return forbiddenResponse();
      return unauthorizedResponse();
    }

    const body = await req.json();
    const parsed = createUserSchema.safeParse(body);
    if (!parsed.success) return apiValidationError(parsed.error);

    const { name, email, password, role, phone, allowedPages } = parsed.data;
    const emailLower = email; // Already lowercased + trimmed by schema transform

    const existing = await prisma.user.findUnique({
      where: { email: emailLower },
    });

    if (existing) {
      return NextResponse.json({ error: 'Email já cadastrado' }, { status: 409 });
    }

    const passwordHash = await hash(password, 12);

    const user = await prisma.user.create({
      data: {
        name, // Already trimmed by schema transform
        email: emailLower,
        passwordHash,
        phone: phone?.trim() || null,
        role,
        status: 'active', // Admin-created users are immediately active
        allowedPages: Array.isArray(allowedPages) && allowedPages.every((p: unknown) => typeof p === 'string' && VALID_PAGE_PATHS.has(p)) ? allowedPages : [],
      },
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
    return apiError(error, 'users');
  }
}
