#!/usr/bin/env node
/**
 * Portão de dependências com dispensa NOMINAL.
 *
 * `npm audit --audit-level=high` é tudo-ou-nada: um aviso sem correção a
 * montante trava todo PR, e a saída fácil é baixar o nível — que apaga o
 * portão inteiro em silêncio. Aqui a dispensa é por advisory, com motivo e
 * validade, e qualquer aviso high/critical fora da lista reprova.
 *
 * Uma dispensa que não casa com nada também reprova: lista morta vira
 * permissão esquecida.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const WAIVERS = [
  {
    advisory: 'GHSA-3f6p-5ww8-9rcr',
    package: 'mysql2',
    expires: '2026-12-01',
    reason:
      'mysql2 chega só como dependência transitiva do CLI prisma@7.10.0. O '
      + 'datasource do QLMED é postgresql e não há uma linha de mysql no código, '
      + 'então o driver nunca é carregado. A correção proposta pelo npm '
      + '(prisma@6.19.3) é um downgrade major. Revisar quando o prisma 7.x '
      + 'passar a exigir mysql2 >= 3.22.0.',
  },
];

const BLOCKING = new Set(['high', 'critical']);

function runAudit() {
  // Deixa o teste alimentar um relatório sintético. Sem isto, exercitar
  // "advisory novo e não dispensado reprova" exigiria instalar um pacote
  // vulnerável de propósito — e essa propriedade nunca tinha sido testada.
  const injected = process.env.QLMED_AUDIT_REPORT_FILE;
  if (injected) return JSON.parse(readFileSync(injected, 'utf8'));

  // npm audit sai com código 1 quando encontra algo: o status é esperado e a
  // decisão é nossa. O que não pode acontecer é JSON ilegível passar por "ok".
  const proc = spawnSync(
    'npm',
    ['audit', '--omit=dev', '--json'],
    { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
  );
  if (proc.error) {
    throw new Error(`npm audit não executou: ${proc.error.message}`);
  }
  try {
    return JSON.parse(proc.stdout);
  } catch {
    const detail = (proc.stderr || proc.stdout || '').trim().slice(0, 500);
    throw new Error(`npm audit não devolveu JSON (status ${proc.status}): ${detail}`);
  }
}

/**
 * GHSA de um aviso, seguindo os `via` que apontam para outro pacote.
 *
 * A severidade que decide é a do ADVISORY, não a do nó. O `npm audit` reporta
 * no nó uma severidade agregada que pode ser MENOR que a do aviso que ele
 * carrega — um `critical` pendurado num nó `moderate` passava por baixo do
 * filtro. Achado da re-auditoria adversarial sobre este próprio portão.
 */
function advisoriesFor(name, vulnerabilities, seen = new Set()) {
  if (seen.has(name)) return [];
  seen.add(name);
  const vuln = vulnerabilities[name];
  if (!vuln) return [];
  const found = [];
  for (const via of vuln.via || []) {
    if (typeof via === 'string') {
      found.push(...advisoriesFor(via, vulnerabilities, seen));
      continue;
    }
    const match = /GHSA-[0-9a-z-]+/i.exec(via.url || '');
    found.push({
      id: match ? match[0] : `npm-${via.source}`,
      package: via.name || name,
      severity: via.severity || vuln.severity,
    });
  }
  return found;
}

function main() {
  const today = new Date().toISOString().slice(0, 10);
  const report = runAudit();
  const vulnerabilities = report.vulnerabilities || {};

  const expired = WAIVERS.filter((w) => w.expires < today);
  if (expired.length > 0) {
    for (const w of expired) {
      console.error(`Dispensa vencida em ${w.expires}: ${w.advisory} (${w.package}). Revalide ou remova.`);
    }
    process.exit(1);
  }

  const used = new Set();
  const blocking = [];

  for (const [name, vuln] of Object.entries(vulnerabilities)) {
    const advisories = advisoriesFor(name, vulnerabilities);
    const severe = advisories.filter((a) => BLOCKING.has(a.severity));
    // Bloqueia se o NÓ é high/critical OU se qualquer advisory que ele carrega
    // é — as duas coisas, porque nenhuma implica a outra.
    if (!BLOCKING.has(vuln.severity) && severe.length === 0) continue;

    const considered = severe.length > 0 ? severe : advisories;
    const unwaived = considered.filter((a) => {
      const waiver = WAIVERS.find((w) => w.advisory === a.id && w.package === a.package);
      if (waiver) {
        used.add(waiver.advisory);
        return false;
      }
      return true;
    });
    if (considered.length === 0 || unwaived.length > 0) {
      blocking.push({ name, severity: vuln.severity, advisories: unwaived });
    }
  }

  const stale = WAIVERS.filter((w) => !used.has(w.advisory));
  if (stale.length > 0) {
    for (const w of stale) {
      console.error(`Dispensa sem aviso correspondente: ${w.advisory} (${w.package}). Remova-a.`);
    }
    process.exit(1);
  }

  if (blocking.length > 0) {
    console.error('Avisos high/critical sem dispensa:');
    for (const item of blocking) {
      const ids = item.advisories.map((a) => `${a.id} (${a.package})`).join(', ') || 'sem advisory identificado';
      console.error(`  ${item.name} [${item.severity}] — ${ids}`);
    }
    console.error('\nCorrija a dependência ou adicione uma dispensa nominal em scripts/verify-dependency-audit.mjs.');
    process.exit(1);
  }

  for (const w of WAIVERS) {
    console.log(`Dispensado até ${w.expires}: ${w.advisory} (${w.package})`);
  }
  console.log('Dependency audit OK');
}

main();
