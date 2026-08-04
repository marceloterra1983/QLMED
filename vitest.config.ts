import { configDefaults, defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    // O runner self-hosted mantém um checkout completo do QLMED em
    // actions-runner-qlmed-prod/_work/; sem este exclude o vitest coleta
    // aquela cópia e reporta falhas que não pertencem a este working tree.
    exclude: [...configDefaults.exclude, 'actions-runner-qlmed-prod/**'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
