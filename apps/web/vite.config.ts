import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // GitHub Pages serves the app from /<repo>/ (see `npm run build:pages`).
  base: process.env.BASE_PATH ?? '/',
  server: {
    port: 5173,
    proxy: { '/api': 'http://127.0.0.1:8787' },
  },
  build: {
    chunkSizeWarningLimit: 1500,
  },
});
