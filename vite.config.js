import { defineConfig } from 'vite';

export default defineConfig({
  // Use relative paths so the app works on GitHub Pages sub-paths
  base: './',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    // Ensure the worker is bundled correctly
    worker: {
      format: 'es'
    }
  }
});
