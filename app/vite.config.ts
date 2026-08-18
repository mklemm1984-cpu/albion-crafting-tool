import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Must match the GitHub Pages repo path exactly, including the trailing
  // dash: github.com/mklemm1984-cpu/albion-crafting-tool-
  // -> https://mklemm1984-cpu.github.io/albion-crafting-tool-/.
  // Adjust if the repo is renamed.
  base: '/albion-crafting-tool-/',
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/setupTests.ts',
  },
});
