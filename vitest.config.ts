import { configDefaults, defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  // Necessário para os testes de render (.test.tsx): sem o transform de JSX o
  // vitest não consegue montar componente nenhum. Ficheiros .ts não passam
  // pelo plugin, então a suíte existente não muda de comportamento.
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
