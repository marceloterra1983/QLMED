import { NextResponse } from 'next/server';
import { randomBytes, createHash } from 'crypto';
import { requireAdmin, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { apiError } from '@/lib/api-error';
import { z } from 'zod';

const createSchema = z.object({
  name: z.string().trim().min(3).max(80),
  scopes: z.array(z.string().trim().min(1).max(40)).min(1).max(20),
});

/**
 * GET — list non-revoked ApiKey entries. `keyHash` is NEVER returned; the
 * clear value is shown exactly once at POST time and cannot be recovered.
 */
export async function GET() {
  try {
    try {
      await requireAdmin();
    } catch (e: unknown) {
      if (e instanceof Error && e.message === 'FORBIDDEN') return forbiddenResponse();
      return unauthorizedResponse();
    }

    const keys = await prisma.apiKey.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        scopes: true,
        createdById: true,
        createdAt: true,
        lastUsedAt: true,
        revokedAt: true,
      },
    });
    return NextResponse.json({ keys });
  } catch (error) {
    return apiError(error, 'admin/api-keys:GET');
  }
}

/**
 * POST — create a new API key. Returns the clear key ONLY in this response
 * (`{ key, id, ... }`). Callers must store it immediately; we only keep a
 * SHA-256 hash server-side, so it cannot be re-displayed later.
 */
export async function POST(req: Request) {
  try {
    let admin: { userId: string };
    try {
      admin = await requireAdmin();
    } catch (e: unknown) {
      if (e instanceof Error && e.message === 'FORBIDDEN') return forbiddenResponse();
      return unauthorizedResponse();
    }

    const body = await req.json().catch(() => ({}));
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Dados inválidos', details: parsed.error.flatten() }, { status: 400 });
    }

    // 32 random bytes → 64 hex chars. Prefix `qlmed_` makes the key
    // unmistakable in logs and easier to spot if accidentally leaked.
    const raw = `qlmed_${randomBytes(32).toString('hex')}`;
    const keyHash = createHash('sha256').update(raw, 'utf8').digest('hex');

    const created = await prisma.apiKey.create({
      data: {
        name: parsed.data.name,
        scopes: parsed.data.scopes,
        keyHash,
        createdById: admin.userId,
      },
      select: { id: true, name: true, scopes: true, createdAt: true },
    });

    return NextResponse.json(
      {
        ...created,
        key: raw, // one-time display — never returned again
        message: 'Guarde esta chave agora. Ela NÃO será exibida novamente.',
      },
      { status: 201 },
    );
  } catch (error) {
    return apiError(error, 'admin/api-keys:POST');
  }
}
