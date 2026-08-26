import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSessionRole, unauthorizedResponse } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { apiError, apiValidationError } from '@/lib/api-error';
import { createLogger } from '@/lib/logger';
import {
  NOTIFICATION_PREFERENCE_DEFAULTS,
  listEffectivePreferences,
} from '@/lib/notification-preferences';

const log = createLogger('users/me/notification-preferences');

const EVENT_TYPES = Object.keys(NOTIFICATION_PREFERENCE_DEFAULTS) as [
  keyof typeof NOTIFICATION_PREFERENCE_DEFAULTS,
  ...Array<keyof typeof NOTIFICATION_PREFERENCE_DEFAULTS>,
];

const putSchema = z
  .object({
    preferences: z
      .array(
        z
          .object({
            eventType: z.enum(EVENT_TYPES),
            enabled: z.boolean(),
          })
          .strict(),
      )
      .min(1),
  })
  .strict()
  .refine(
    (body) => new Set(body.preferences.map((p) => p.eventType)).size === body.preferences.length,
    { message: 'eventType repetido no mesmo corpo' },
  );

/**
 * requireSessionRole, NUNCA requireAuth.
 *
 * requireAuth também autentica por chave de API e devolveria o userId do
 * CRIADOR da chave — uma integração passaria a ler e sobrescrever preferências
 * pessoais de alguém que não agiu. 'viewer' é o piso da hierarquia: todo
 * usuário ativo governa as próprias preferências.
 *
 * Não existe parâmetro de id de usuário em lugar nenhum desta rota. O sujeito
 * vem da sessão, então não há identificador de requisição capaz de ampliar
 * acesso (Princípio II da constituição).
 */
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
    const rows = await prisma.userNotificationPreference.findMany({
      where: { userId },
      select: { eventType: true, enabled: true },
    });
    return NextResponse.json({ preferences: listEffectivePreferences(rows) });
  } catch (error) {
    return apiError(error, 'users/me/notification-preferences');
  }
}

export async function PUT(req: Request) {
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

  const parsed = putSchema.safeParse(body);
  if (!parsed.success) return apiValidationError(parsed.error);

  try {
    // Parcial, não substituição: gravar um tipo não apaga os demais, senão
    // "liguei um" viraria "desliguei o resto". Idempotente por upsert.
    await prisma.$transaction(
      parsed.data.preferences.map((pref) =>
        prisma.userNotificationPreference.upsert({
          where: { userId_eventType: { userId, eventType: pref.eventType } },
          create: { userId, eventType: pref.eventType, enabled: pref.enabled },
          update: { enabled: pref.enabled },
        }),
      ),
    );

    // FR-009: reusa a ação user_updated (decisão do dono). O path é o que
    // distingue "usuário mudou a própria preferência" de "admin alterou
    // usuário", que compartilham a mesma ação. Não bloqueante: falha de log
    // não pode derrubar a gravação — mesmo padrão de auth.ts:123-125.
    const changed = parsed.data.preferences.map((p) => p.eventType).join(',');
    prisma.accessLog
      .create({
        data: { userId, action: 'user_updated', path: `notification-preferences:${changed}` },
      })
      .catch((err) => log.warn({ err }, 'AccessLog user_updated write failed'));

    // Devolve o estado GRAVADO, relido — não o corpo enviado. É o que impede a
    // tela de assumir sucesso e pintar o interruptor sozinha (FR-004), que era
    // exatamente o defeito original.
    const rows = await prisma.userNotificationPreference.findMany({
      where: { userId },
      select: { eventType: true, enabled: true },
    });
    return NextResponse.json({ preferences: listEffectivePreferences(rows) });
  } catch (error) {
    return apiError(error, 'users/me/notification-preferences');
  }
}
