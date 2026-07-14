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

