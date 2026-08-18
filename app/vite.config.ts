import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Must match the GitHub Pages repo path, e.g. github.com/<user>/albion-crafting-tool
  // -> https://<user>.github.io/albion-crafting-tool/. Adjust if the repo is renamed.
  base: '/albion-crafting-tool/',
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/setupTests.ts',
  },
});
