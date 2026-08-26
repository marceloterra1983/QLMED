#!/usr/bin/env node

let raw = '';
for await (const chunk of process.stdin) raw += chunk;

let filePath = '';
try {
  const payload = raw ? JSON.parse(raw) : {};
  filePath = String(payload.file_path ?? payload.filePath ?? payload.path ?? '');
} catch {
  filePath = '';
}

const codeTouch = /\.(ts|tsx|js|jsx|mjs|cjs|prisma)$/.test(filePath)
  || /(^|\/)(src|prisma|scripts)\//.test(filePath);

if (!codeTouch) {
  process.stdout.write('{}');
  process.exit(0);
}

process.stdout.write(JSON.stringify({
  additional_context: 'Code changed. Before finishing, run `graphify update .` so the next session queries a current graph.',
}));
