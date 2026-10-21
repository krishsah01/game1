import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// The browser talks to a same-origin /graphql URL. In development and in
// `vite preview` that path is proxied to the local GraphQL Yoga server
// (server/index.ts), which binds to loopback only.
const graphqlProxy = {
  '/graphql': {
    target: 'http://127.0.0.1:4000',
    changeOrigin: false,
  },
};

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: false,
    proxy: graphqlProxy,
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
    proxy: graphqlProxy,
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 1400,
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
