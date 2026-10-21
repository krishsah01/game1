import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// The browser talks to a same-origin /graphql URL. In development and in
// `vite preview` that path is proxied to the local GraphQL Yoga server
// (server/index.ts), which binds to loopback only. Ports are strict (a busy
// port fails loudly instead of silently moving); API_PORT / WEB_PORT let a
// second checkout run beside the default 4000 / 5173 pair.
const API_PORT = Number(process.env.API_PORT ?? 4000);
const WEB_PORT = Number(process.env.WEB_PORT ?? 5173);
const graphqlProxy = {
  '/graphql': {
    target: `http://127.0.0.1:${API_PORT}`,
    changeOrigin: false,
  },
};

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: WEB_PORT,
    // Fail loudly instead of silently moving to another port (the README names this URL).
    strictPort: true,
    proxy: graphqlProxy,
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
    strictPort: true,
    proxy: graphqlProxy,
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 1400,
    // VITE_INLINE_ASSETS=1 embeds the reference boards as data URIs for a single-file static bundle.
    assetsInlineLimit: process.env.VITE_INLINE_ASSETS ? 8_000_000 : 4096,
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // graphql ships CJS (main) and ESM (module) builds. Externalised deps load the
    // CJS build through Node while test files would get the ESM build through Vite,
    // which graphql rejects as "another realm". Pin tests to the single CJS copy.
    alias: { graphql: fileURLToPath(new URL('./node_modules/graphql/index.js', import.meta.url)) },
  },
});
