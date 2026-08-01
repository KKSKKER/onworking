import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  root: 'src/renderer',
  base: './',
  build: {
    outDir: '../../dist/renderer',
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      '@common': path.resolve(__dirname, 'src/common'),
    },
  },
  css: {
    // Univer ships its own CSS; ensure it's processed
    devSourcemap: true,
  },
  optimizeDeps: {
    // Pre-bundle Univer packages for dev performance
    include: [
      '@univerjs/core',
      '@univerjs/design',
      '@univerjs/engine-formula',
      '@univerjs/sheets',
      '@univerjs/ui',
      '@univerjs/sheets-formula',
      '@univerjs/sheets-ui',
    ],
  },
});
