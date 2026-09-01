import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import yaml from 'js-yaml';

/**
 * Portões dos manifestos de implantação (auditoria b177b07).
 *
 * Estes são os únicos artefatos do repositório que não têm comportamento para
 * renderizar nem função para chamar: um Dockerfile, um compose e um .sql são
 * texto que o Docker e o Prisma interpretam. Ler o ficheiro é a verificação
 * certa aqui — ao contrário do que acontecia com a UI, onde ler o fonte era um
 * substituto ruim para renderizar (QLMED-TEST-001).
 *
 * Cada portão abaixo é exercido nos DOIS sentidos: o manifesto real tem de
 * passar, e uma entrada sintética com o defeito tem de reprovar. Um portão que
 * só sabe dizer sim é pior do que portão nenhum.
 */

const root = resolve(__dirname, '../../..');
const read = (relative: string) => readFileSync(join(root, relative), 'utf8');

/** Um segredo não pode ser build-arg: vira camada de imagem e `docker history`. */
const SECRET_ARG = /^\s{4,}(\w*(?:KEY|SECRET|TOKEN|PASSWORD)\w*):\s*\$\{/im;

function buildArgsBlocks(compose: string): string[] {
  // Recorta cada bloco `args:` de `build:` até a próxima chave de mesma indentação.
  const blocks: string[] = [];
  const lines = compose.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const match = lines[i].match(/^(\s+)args:\s*$/);
    if (!match) continue;
    const indent = match[1].length;
    const body: string[] = [];
    for (let j = i + 1; j < lines.length; j += 1) {
      const line = lines[j];
      if (line.trim() === '') continue;
      const lineIndent = line.length - line.trimStart().length;
      if (lineIndent <= indent) break;
      body.push(line);
    }
    blocks.push(body.join('\n'));
  }
  return blocks;
}

const COMPOSE_FILES = [
  'docker-compose.yml',
  'production/docker-compose.yml',
  'ops/compose/qlmed-stack.yml',
];

/**
 * QLMED-OPS-001 pedia um gate de manifests: um PR que só toca
 * `production/docker-compose.yml` tem de reprovar o `quality` se o compose
 * estiver inválido. O filtro de caminhos do `ci.yml` agora roteia `production/**`
 * e `ops/**` para o job `app`, que roda `npm test` — e é aqui que a validade
 * do compose é decidida. Sem `docker compose config`: o pool isolado de CI não
 * expõe socket de engine, então a validação é estrutural, feita pelo parser.
 */
describe('QLMED-OPS-001 — os composes são YAML válido e bem formados', () => {
  it.each(COMPOSE_FILES)('%s carrega e declara serviços', (file) => {
    const parsed = yaml.load(read(file)) as Record<string, unknown> | undefined;
    expect(parsed, `${file} não é YAML válido`).toBeTruthy();

    const services = parsed?.services as Record<string, Record<string, unknown>> | undefined;
    expect(services, `${file} não declara services`).toBeTruthy();
    expect(Object.keys(services ?? {}).length).toBeGreaterThan(0);

    for (const [name, service] of Object.entries(services ?? {})) {
      // Todo serviço precisa de uma origem de imagem: `image` ou `build`.
      expect(
        Boolean(service.image) || Boolean(service.build),
        `${file}: serviço ${name} sem image nem build`,
      ).toBe(true);
    }
  });

  it('reprova YAML inválido e compose sem serviço (controlo positivo)', () => {
    expect(() => yaml.load('services:\n  app:\n   - bad\n  : :')).toThrow();

    const noServices = yaml.load('volumes:\n  pgdata: {}\n') as Record<string, unknown>;
    expect(noServices.services).toBeUndefined();
  });

  it('production declara os serviços que o deploy espera', () => {
    const parsed = yaml.load(read('production/docker-compose.yml')) as {
      services: Record<string, unknown>;
    };
    // `deploy-production.yml` constrói e sobe `qlmed-app` pelo nome.
    expect(Object.keys(parsed.services)).toContain('qlmed-app');
    expect(Object.keys(parsed.services)).toContain('qlmed-db');
  });
});

describe('QLMED-OPS-003 — segredo não entra como build-arg', () => {
  it.each(COMPOSE_FILES)('%s não passa segredo em build.args', (file) => {
    for (const block of buildArgsBlocks(read(file))) {
      expect(block).not.toMatch(SECRET_ARG);
    }
  });

  it('reprova um build-arg de segredo sintético (controlo positivo)', () => {
    const poisoned = [
      'services:',
      '  qlmed-app:',
      '    build:',
      '      context: ./app',
      '      args:',
      '        QLMED_API_KEY: ${QLMED_API_KEY}',
    ].join('\n');
    const blocks = buildArgsBlocks(poisoned);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatch(SECRET_ARG);
  });

  it('production/docker-compose.yml é o compose canônico e ops/ diz isso', () => {
    // O deploy canônico aponta explicitamente para production/.
    expect(read('.github/workflows/deploy-production.yml')).toContain(
      '/home/marce/qlmed/production/docker-compose.yml',
    );
    // E a cópia histórica em ops/ não pode voltar a fingir que é canônica.
    expect(read('ops/compose/qlmed-stack.yml')).toContain('NÃO é o compose canônico');
  });
});

describe('QLMED-SUPPLY-002 — imagem base do app pinada por digest', () => {
  const fromLines = read('Dockerfile')
    .split('\n')
    .filter((line) => line.startsWith('FROM '));

  it('todos os estágios usam digest, não a tag móvel', () => {
    expect(fromLines.length).toBeGreaterThan(0);
    for (const line of fromLines) {
      expect(line).toMatch(/^FROM \S+@sha256:[0-9a-f]{64} AS \w+$/);
    }
  });

  it('os estágios compartilham o mesmo digest', () => {
    const digests = new Set(fromLines.map((line) => line.split('@')[1].split(' ')[0]));
    expect(digests.size).toBe(1);
  });

  it('reprova uma tag móvel sintética (controlo positivo)', () => {
    expect('FROM node:22-alpine AS deps').not.toMatch(
      /^FROM \S+@sha256:[0-9a-f]{64} AS \w+$/,
    );
  });
});

/**
 * QLMED-OPS-005: `deploy-production.yml` para o `qlmed-app`, roda
 * `migrate deploy` e sobe de novo. Se a implantação falhar depois do migrate, o
 * rollback é de IMAGEM — o DDL já aplicado fica. Portanto a imagem N-1 tem de
 * conseguir arrancar contra o schema N, e isso só é verdade enquanto as
 * migrações forem expand-only.
 *
 * O corte é a data da auditoria: as 24 migrações anteriores incluem um
 * `DROP COLUMN "role"` de fev/2026 que já está aplicado em produção há meses —
 * reescrevê-lo agora seria pior do que o defeito. O portão vale para o que
 * vier a seguir.
 */
const EXPAND_ONLY_CUTOFF = '20260901';

const DESTRUCTIVE_DDL: Array<{ label: string; pattern: RegExp }> = [
  { label: 'DROP TABLE', pattern: /\bDROP\s+TABLE\b/i },
  { label: 'DROP COLUMN', pattern: /\bDROP\s+COLUMN\b/i },
  { label: 'SET NOT NULL', pattern: /\bALTER\s+COLUMN\b[\s\S]{0,80}?\bSET\s+NOT\s+NULL\b/i },
  { label: 'RENAME COLUMN', pattern: /\bRENAME\s+COLUMN\b/i },
];

export function findDestructiveDdl(sql: string): string[] {
  // Comentários de migração não contam: só o DDL executável.
  const executable = sql
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n');
  return DESTRUCTIVE_DDL.filter(({ pattern }) => pattern.test(executable)).map(
    ({ label }) => label,
  );
}

describe('QLMED-OPS-005 — migrações novas são expand-only', () => {
  const migrationsDir = join(root, 'prisma/migrations');
  const newMigrations = existsSync(migrationsDir)
    ? readdirSync(migrationsDir).filter(
        (name) => /^\d{14}_/.test(name) && name.slice(0, 8) >= EXPAND_ONLY_CUTOFF,
      )
    : [];

  it('o diretório de migrações existe e foi lido', () => {
    expect(existsSync(migrationsDir)).toBe(true);
  });

  it.each(newMigrations.length > 0 ? newMigrations : ['(nenhuma migração nova)'])(
    '%s não contém DDL destrutivo',
    (name) => {
      if (name.startsWith('(')) return;
      const sql = readFileSync(join(migrationsDir, name, 'migration.sql'), 'utf8');
      expect(findDestructiveDdl(sql)).toEqual([]);
    },
  );

  it('reprova DDL destrutivo sintético (controlo positivo)', () => {
    expect(findDestructiveDdl('ALTER TABLE "Invoice" DROP COLUMN "xmlContent";')).toEqual([
      'DROP COLUMN',
    ]);
    expect(findDestructiveDdl('DROP TABLE "Invoice";')).toEqual(['DROP TABLE']);
    expect(
      findDestructiveDdl('ALTER TABLE "Invoice" ALTER COLUMN "cfop" SET NOT NULL;'),
    ).toEqual(['SET NOT NULL']);
  });

  it('não confunde comentário com DDL (controlo negativo)', () => {
    expect(findDestructiveDdl('-- não fazer DROP COLUMN aqui\nALTER TABLE "x" ADD "y" TEXT;')).toEqual(
      [],
    );
  });
});

/**
 * QLMED-UI-003 — o relatório de válvulas tinha um mapa `REAL_STOCK` com a
 * contagem física de fev/2026 e o `netQty` preferia esse número ao cálculo. A
 * tela chama a coluna de "Saldo" — o leitor entende comprado menos vendido.
 *
 * A ausência de uma tabela de dados cravada é uma propriedade do FONTE, não de
 * uma execução: não há entrada que faça um `const` aparecer. Por isso, e só
 * por isso, este portão lê o ficheiro. Onde havia comportamento para observar
 * (as listas fiscais), a verificação é render — ver os `.test.tsx`.
 */
describe('QLMED-UI-003 — relatório de válvulas sem estoque cravado', () => {
  const route = read('src/app/api/reports/valvulas-importadas/route.ts');

  it('não tem mapa de estoque cravado sobrescrevendo o saldo', () => {
    expect(route).not.toMatch(/REAL_STOCK\s*[:[]/);
    expect(route).not.toMatch(/netQty:\s*\w+\[[^\]]*\]\s*\?\?/);
  });

  it('netQty é comprado menos vendido', () => {
    expect(route).toMatch(/netQty:\s*Math\.round\(\(p\.purchasedQty - p\.soldQty\)/);
  });

  it('reprova um override sintético (controlo positivo)', () => {
    const poisoned = 'netQty: REAL_STOCK[p.code] ?? Math.round((p.purchasedQty - p.soldQty) * 100) / 100,';
    expect(poisoned).toMatch(/netQty:\s*\w+\[[^\]]*\]\s*\?\?/);
  });
});
