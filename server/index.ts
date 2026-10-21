/**
 * Local GraphQL Yoga HTTP server (development API).
 *
 *   npm run dev:api   → http://127.0.0.1:4000/graphql  (GraphiQL at the same URL)
 *
 * Binds to loopback only. The Vite dev/preview server proxies /graphql here so
 * the browser always uses a same-origin URL. Sessions are in memory and are
 * lost on restart; the app offers a clean new session when that happens.
 */
import { createServer } from 'node:http';
import { createYoga } from 'graphql-yoga';
import { buildSchema } from './schema.ts';
import { createStore } from './store.ts';

const PORT = Number(process.env.PORT ?? 4000);
const HOST = process.env.HOST ?? '127.0.0.1';

const store = createStore();
const yoga = createYoga({
  schema: buildSchema(store),
  graphqlEndpoint: '/graphql',
  landingPage: false,
  maskedErrors: false,
  logging: 'warn',
});

const server = createServer(yoga);
server.listen(PORT, HOST, () => {
  console.log(`[api] GraphQL ready at http://${HOST}:${PORT}${yoga.graphqlEndpoint}`);
});
