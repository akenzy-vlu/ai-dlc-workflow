import { fileURLToPath, URL } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const API = process.env.VITE_API_URL ?? 'http://localhost:7777';
const src = (segment: string) => fileURLToPath(new URL(`./src/${segment}`, import.meta.url));

export default defineConfig({
  plugins: [react()],
  // Mirrors tsconfig `paths`. Both have to be kept in step: tsc reads one, the bundler
  // the other, and a mismatch shows up as a build that type-checks and will not run.
  resolve: {
    alias: {
      '@app': src('app'),
      '@domain': src('domain'),
      '@data': src('data'),
      '@presentation': src('presentation'),
      '@shared': src('shared'),
    },
  },
  server: {
    port: 5173,
    // Proxying keeps the browser same-origin in development, so the socket and the REST
    // calls share one host and CORS never enters the picture.
    proxy: {
      '/api': { target: API, changeOrigin: true },
      '/events': { target: API, ws: true, changeOrigin: true },
    },
  },
});
