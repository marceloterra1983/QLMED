/**
 * Auditoria b177b07, QLMED-DATA-012 — retenção de dado operacional.
 *
 * AccessLog, NotificationClick, SyncLog e os caches de CNPJ/NCM são append-only:
 * crescem para sempre e ninguém nunca decidiu por quanto tempo devem existir.
 * AccessLog e NotificationClick guardam rasto de pessoa (userId, ipHash,
 * userAgent), então "para sempre" não é neutro.
 *
 * ESTE MÓDULO NÃO DECIDE PRAZO. O prazo é decisão do dono/DPO e entra por
 * variável de ambiente. Sem a variável, a tabela não é purgada — a única falha
 * segura possível aqui é não apagar. Purgar com prazo chutado é perda de dado, e
 * perda de dado não é correção de auditoria.
 *
 * Ativação também é explícita: nada chama esta função automaticamente. Ligar o
 * purge no bootstrap com prazos ainda não assinados seria trocar um problema de
 * governança por um incidente.
 *
 * Ver docs/decisions/0014-retencao-de-dado-operacional.md.
 */
import prisma from '@/lib/prisma';
import { createLogger } from '@/lib/logger';

const log = createLogger('data-retention');

export interface RetentionRule {
  /** Nome da tabela, como aparece no schema e no ADR. */
  table: string;
  /** Variável que carrega o prazo em dias. Ausente ou inválida = não purga. */
  envVar: string;
  /** Coluna de tempo que define a idade da linha. */
  ageColumn: string;
  /** Por que a linha existe — é o que o DPO precisa ler para dar um prazo. */
  purpose: string;
}

export const RETENTION_RULES: readonly RetentionRule[] = [
  {
    table: 'AccessLog',
    envVar: 'QLMED_RETENTION_ACCESS_LOG_DAYS',
    ageColumn: 'createdAt',
    purpose: 'Trilha de auditoria de login e de ação por usuário.',
  },
  {
    table: 'NotificationClick',
    envVar: 'QLMED_RETENTION_NOTIFICATION_CLICK_DAYS',
    ageColumn: 'createdAt',
    purpose: 'Telemetria de clique em push, com ipHash e userAgent.',
  },
  {
    table: 'SyncLog',
    envVar: 'QLMED_RETENTION_SYNC_LOG_DAYS',
    ageColumn: 'startedAt',
    purpose: 'Histórico de execução de sincronização. Sem dado pessoal.',
  },
  {
    table: 'CnpjCache',
    envVar: 'QLMED_RETENTION_CNPJ_CACHE_DAYS',
    ageColumn: 'fetchedAt',
    purpose: 'Cache de consulta de CNPJ. Reconstrói-se sozinho.',
  },
  {
    table: 'NcmCache',
    envVar: 'QLMED_RETENTION_NCM_CACHE_DAYS',
    ageColumn: 'fetchedAt',
    purpose: 'Cache de descrição de NCM. Reconstrói-se sozinho.',
  },
] as const;

export interface RetentionOutcome {
  table: string;
  /** Dias configurados, ou null quando a variável não está definida. */
  days: number | null;
  /** Linhas apagadas. 0 quando a regra está sem prazo — nada é executado. */
  deleted: number;
  skippedReason?: 'no-retention-configured' | 'invalid-retention';
}

/**
 * Prazo em dias, ou null. Só aceita inteiro positivo: `0` apagaria tudo e
 * `-1`/`abc` são engano de configuração, não intenção.
 */
export function parseRetentionDays(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const days = Number(trimmed);
  if (!Number.isInteger(days) || days < 1) return null;
  return days;
}

type DeleteManyDelegate = {
  deleteMany: (args: { where: Record<string, unknown> }) => Promise<{ count: number }>;
};

function delegateFor(table: string): DeleteManyDelegate {
  const key = table.charAt(0).toLowerCase() + table.slice(1);
  const delegate = (prisma as unknown as Record<string, DeleteManyDelegate>)[key];
  if (!delegate?.deleteMany) {
    throw new Error(`RETENTION_RULES aponta para ${table}, que não é um delegate Prisma`);
  }
  return delegate;
}

/**
 * Apaga o que já passou do prazo, tabela a tabela. Regra sem prazo configurado é
 * pulada e reportada como tal — o retorno diz o que foi feito E o que não foi,
 * para o relatório de operação não confundir "nada a apagar" com "não configurado".
 */
export async function purgeExpiredOperationalData(
  now: Date = new Date(),
  env: Readonly<Record<string, string | undefined>> = process.env,
): Promise<RetentionOutcome[]> {
  const outcomes: RetentionOutcome[] = [];

  for (const rule of RETENTION_RULES) {
    const raw = env[rule.envVar];
    const days = parseRetentionDays(raw);

    if (days === null) {
      outcomes.push({
        table: rule.table,
        days: null,
        deleted: 0,
        skippedReason: raw === undefined || !raw.trim() ? 'no-retention-configured' : 'invalid-retention',
      });
      continue;
    }

    const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    const { count } = await delegateFor(rule.table).deleteMany({
      where: { [rule.ageColumn]: { lt: cutoff } },
    });
    outcomes.push({ table: rule.table, days, deleted: count });
    log.info({ table: rule.table, days, deleted: count }, 'retention_purge');
  }

  return outcomes;
}
