import { defineConfig } from 'vite';
import { copyFileSync } from 'fs';

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
  },
  plugins: [
    {
      name: 'copy-static-assets',
      writeBundle() {
        // Copy root-level assets that aren't in public/ into the dist
        try { copyFileSync('loading.png', 'dist/loading.png'); } catch {}
      }
    }
  ]
});
