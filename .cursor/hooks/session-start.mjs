#!/usr/bin/env node

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const candidates = [
  resolve(root, 'graphify-out/graph.json'),
  resolve(root, '../app/graphify-out/graph.json'),
  resolve(root, '../app-dev/graphify-out/graph.json'),
];
const graph = candidates.find((path) => existsSync(path));
const graphHint = graph
  ? `Knowledge graph is at ${graph}. First codebase question in this session MUST run \`graphify query "<question>"\`${graph.startsWith(root) ? '' : ` --graph "${graph}"`}.`
  : 'No graph.json found in this checkout or sibling app/app-dev. Say that Graphify is unavailable, then use Read/Grep.';

const additional_context = [
  'QLMED AI contract (injected every session):',
  graphHint,
  'After code edits run `graphify update .` (AST-only).',
  'Behavior, contracts, data, security or architecture changes require Spec Kit: read governance.yaml, .specify/memory/constitution.md and specs/, then use .cursor/skills/speckit-*.',
  'Do not upgrade the Spec Kit pin on main. Do not read or commit .env.',
].join(' ');

process.stdout.write(JSON.stringify({ additional_context }));
