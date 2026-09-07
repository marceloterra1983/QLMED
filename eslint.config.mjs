import { FlatCompat } from '@eslint/eslintrc';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'out/**',
      'public/**',
      'prisma/**',
      'n8n/**',
      'scripts/**',
      '.planning/**',
      // Agent tools keep sibling worktrees inside the checkout; their files are
      // the same source in another branch and must not fail this lint run.
      '.kilo/**',
      '.kilocode/**',
    ],
  },
  ...compat.extends('next/core-web-vitals'),
];

export default eslintConfig;
