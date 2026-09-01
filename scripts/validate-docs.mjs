#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname, relative, extname } from 'node:path';

const args = process.argv.slice(2);
const rootArg = args.indexOf('--root');
const root = resolve(rootArg >= 0 ? args[rootArg + 1] : process.cwd());
const quiet = args.includes('--quiet');

const errors = [];
const ids = new Map();
const adrIds = new Set();
const markdownFiles = [];

function walk(directory) {
  if (!existsSync(directory)) return;
  for (const entry of readdirSync(directory)) {
    const path = resolve(directory, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) walk(path);
    else if (['.md', '.mdx'].includes(extname(path))) markdownFiles.push(path);
  }
}

function parseFrontmatter(content, file) {
  if (!content.startsWith('---\n') && !content.startsWith('---\r\n')) return null;
  const normalized = content.replaceAll('\r\n', '\n');
  const end = normalized.indexOf('\n---\n', 4);
  if (end < 0) {
    errors.push(`${relative(root, file)}: unclosed frontmatter`);
    return null;
  }
  const values = {};
  for (const line of normalized.slice(4, end).split('\n')) {
    if (!line.trim() || /^\s/.test(line)) continue;
    const match = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (match) values[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '');
  }
  return values;
}

function registerId(id, file) {
  if (!id) return;
  if (ids.has(id)) {
    errors.push(`${relative(root, file)}: duplicate id ${id} (also in ${relative(root, ids.get(id))})`);
  } else {
    ids.set(id, file);
  }
  if (/^ADR-\d{4}$/.test(id)) adrIds.add(id);
}

function validateMetadata(file, content) {
  const rel = relative(root, file).replaceAll('\\', '/');
  const metadata = parseFrontmatter(content, file);
  const isSpec = /^specs\/[^/]+\/spec\.md$/.test(rel);
  const isAdr = /^docs\/decisions\/\d{4}-.+\.md$/.test(rel);

  if (isSpec || isAdr) {
    if (!metadata) {
      errors.push(`${rel}: frontmatter is required`);
      return;
    }
    for (const key of isSpec ? ['id', 'status', 'owner'] : ['id', 'status', 'date']) {
      if (!metadata[key]) errors.push(`${rel}: missing frontmatter field ${key}`);
    }
  }

  if (metadata?.id) {
    const expected = isSpec ? /^SPEC-\d{3}$/ : isAdr ? /^ADR-\d{4}$/ : /^[A-Z][A-Z0-9]+-\d+$/;
    if (!expected.test(metadata.id)) errors.push(`${rel}: invalid id ${metadata.id}`);
    registerId(metadata.id, file);
  }

  if (isAdr && metadata?.status && !['proposed', 'accepted', 'rejected', 'deprecated', 'superseded'].includes(metadata.status)) {
    errors.push(`${rel}: invalid ADR status ${metadata.status}`);
  }
}

// Documentação de deploy não pode ensinar um caminho que o código não tem.
//
// Auditoria b177b07 (QLMED-DOC-001): `docs/deployment/qlmed-app.md` mandava
// rodar `npm run db:push` (nunca foi script deste package.json, e `prisma db
// push` altera DDL do banco de PRODUÇÃO sem gravar migração) e prometia deploy
// automático via `workflow_run` (gatilho proibido por
// scripts/verify-ci-hardening.sh desde 2026-08-17). Doc que descreve um
// caminho inexistente é pior do que doc ausente: o leitor tenta executar.
const DEPLOY_DOC_BANS = [
  {
    pattern: /\bdb:push\b/,
    fencedOnly: true,
    message: '`db:push` em bloco de comando: não existe como script e `prisma db push` altera o schema de produção sem migração — use `db:migrate:deploy`',
  },
  {
    pattern: /\bworkflow_run\b/,
    fencedOnly: false,
    message: '`workflow_run`: gatilho proibido pelo hardening de CI; o deploy é `workflow_dispatch` manual',
  },
];

function fencedBlocks(content) {
  return [...content.matchAll(/^```[^\n]*\n([\s\S]*?)^```/gm)].map((match) => match[1]);
}

function validateDeployDocs(file, content) {
  const rel = relative(root, file).replaceAll('\\', '/');
  if (!/^docs\/deployment\//.test(rel)) return;

  const blocks = fencedBlocks(content);
  for (const ban of DEPLOY_DOC_BANS) {
    const haystacks = ban.fencedOnly ? blocks : [content];
    if (haystacks.some((text) => ban.pattern.test(text))) {
      errors.push(`${rel}: ${ban.message}`);
    }
  }
}

function validateLinks(file, content) {
  const rel = relative(root, file);
  const linkPattern = /\[[^\]]*\]\(([^)]+)\)/g;
  for (const match of content.matchAll(linkPattern)) {
    const target = match[1].trim().split('#')[0];
    if (!target || /^(https?:|mailto:|#)/.test(target) || target.includes('[PLACEHOLDER]')) continue;
    const decoded = decodeURIComponent(target.replace(/^<|>$/g, ''));
    if (!existsSync(resolve(dirname(file), decoded))) errors.push(`${rel}: broken local link ${target}`);
  }
}

walk(resolve(root, 'docs'));
walk(resolve(root, 'specs'));

const contents = new Map();
for (const file of markdownFiles) {
  const content = readFileSync(file, 'utf8');
  contents.set(file, content);
  validateMetadata(file, content);
  validateDeployDocs(file, content);
  validateLinks(file, content);
}

for (const [file, content] of contents) {
  for (const match of content.matchAll(/\bADR-\d{4}\b/g)) {
    const id = match[0];
    if (id !== 'ADR-0000' && !adrIds.has(id)) {
      errors.push(`${relative(root, file)}: references missing ${id}`);
    }
  }
}

if (errors.length) {
  console.error(`Documentation validation failed (${errors.length}):`);
  for (const error of [...new Set(errors)].sort()) console.error(`- ${error}`);
  process.exit(1);
}

if (!quiet) console.log(`Documentation validation passed (${markdownFiles.length} Markdown files, ${ids.size} IDs).`);

