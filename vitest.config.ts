import { configDefaults, defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  // `tsconfig.json` deixa o JSX em `preserve` para o Next; sem este plugin o
  // vitest recebe TSX cru e falha na análise de importação.
  // Ficheiros .ts não passam pelo plugin: a suíte existente não muda.
  plugins: [react()],
  test: {
    // Padrão continua node. Os testes de render declaram
    // `// @vitest-environment jsdom` no topo — carregar jsdom nos ~97
    // ficheiros de lógica pura só custaria tempo de arranque.
    environment: 'node',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
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
