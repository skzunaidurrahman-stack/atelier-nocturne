import { defineConfig } from 'vite';

export default defineConfig({
  // Relative by default; the Pages workflow sets BASE_PATH=/<repo>/ so asset URLs
  // resolve under the project sub-path. Works from any folder or host.
  base: process.env.BASE_PATH || './',
  build: {
    outDir: 'dist',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 1200,
  },
});
