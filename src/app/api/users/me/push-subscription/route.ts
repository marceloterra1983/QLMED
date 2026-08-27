import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSessionRole, unauthorizedResponse } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { apiError, apiValidationError } from '@/lib/api-error';
import { createLogger } from '@/lib/logger';
import {
  normalizePushEndpoint,
  normalizePushKey,
} from '@/lib/push-subscriptions';
import { getVapidPublicKey } from '@/lib/web-push';

const log = createLogger('users/me/push-subscription');

const subscriptionSchema = z
  .object({
    endpoint: z.string().trim().min(1).max(2048),
    keys: z
      .object({
        p256dh: z.string().trim().min(1).max(256),
        auth: z.string().trim().min(1).max(256),
      })
      .strict(),
  })
  .strict();

async function sessionUserId(): Promise<string> {
  const { userId } = await requireSessionRole('viewer');
  return userId;
}

export async function GET() {
  let userId: string;
  try {
    userId = await sessionUserId();
  } catch {
    return unauthorizedResponse();
  }

  try {
    const count = await prisma.pushSubscription.count({ where: { userId } });
    return NextResponse.json({
      vapidPublicKey: getVapidPublicKey(),
      deviceCount: count,
    });
  } catch (error) {
    return apiError(error, 'users/me/push-subscription');
  }
}

export async function POST(req: Request) {
  let userId: string;
  try {
    userId = await sessionUserId();
  } catch {
    return unauthorizedResponse();
  }

  if (!getVapidPublicKey()) {
    return NextResponse.json({ error: 'Aviso no celular nao esta configurado' }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Dados invalidos' }, { status: 400 });
  }

  const parsed = subscriptionSchema.safeParse(body);
  if (!parsed.success) return apiValidationError(parsed.error);

  try {
    const endpoint = normalizePushEndpoint(parsed.data.endpoint);
    const p256dh = normalizePushKey(parsed.data.keys.p256dh, 'p256dh');
    const auth = normalizePushKey(parsed.data.keys.auth, 'auth');

    await prisma.pushSubscription.upsert({
      where: { endpoint },
      create: { userId, endpoint, p256dh, auth },
      update: { userId, p256dh, auth },
    });

    prisma.accessLog
      .create({
        data: { userId, action: 'user_updated', path: 'push-subscription:upsert' },
      })
      .catch((err) => log.warn({ err }, 'AccessLog push upsert failed'));

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && /Push /.test(error.message)) {
      return NextResponse.json({ error: 'Inscricao invalida' }, { status: 400 });
    }
    return apiError(error, 'users/me/push-subscription');
  }
}

export async function DELETE(req: Request) {
  let userId: string;
  try {
    userId = await sessionUserId();
  } catch {
    return unauthorizedResponse();
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Dados invalidos' }, { status: 400 });
  }

  const parsed = z.object({ endpoint: z.string().trim().min(1).max(2048) }).strict().safeParse(body);
  if (!parsed.success) return apiValidationError(parsed.error);

  try {
    const endpoint = normalizePushEndpoint(parsed.data.endpoint);
    await prisma.pushSubscription.deleteMany({ where: { userId, endpoint } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && /Push /.test(error.message)) {
      return NextResponse.json({ error: 'Inscricao invalida' }, { status: 400 });
    }
    return apiError(error, 'users/me/push-subscription');
  }
}
