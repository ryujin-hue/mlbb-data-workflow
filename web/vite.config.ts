import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

/**
 * Build output ditulis ke `../site` - folder itu yang di-serve Worker
 * (`assets.directory` di wrangler.jsonc) dan juga yang dipakai Cloudflare
 * Pages sebagai output directory.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@shared': resolve(__dirname, '../shared'),
      '@': resolve(__dirname, 'src'),
    },
  },
  build: {
    outDir: '../site',
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: false,
    // Code splitting: vendor dipisah supaya bisa di-cache lama.
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'react';
          if (id.includes('@tanstack')) return 'virtual';
          return undefined;
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'https://mlbb-data-workflow.mlvv.workers.dev',
    },
  },
});
