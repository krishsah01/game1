/**
 * Picks the GraphQL transport.
 *   - `?transport=inprocess` or a file:// page → in-process demo immediately.
 *   - otherwise probe the same-origin /graphql endpoint with a real query.
 *     On a static host (not localhost) a failed probe falls back to the
 *     in-process demo automatically; on localhost the failure is surfaced so
 *     the developer can start the API (`npm run dev`) or choose the fallback.
 */
import { ApiClient } from '../graphql/client.ts';
import { InProcessTransport } from '../graphql/inprocess.ts';
import { HttpTransport, type Transport } from '../graphql/transport.ts';

export interface TransportChoice {
  client: ApiClient;
  probeError: string | null;
  autoFallback: boolean;
}

const isLocalHost = () => ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);

export function wantsInProcess(): boolean {
  // VITE_TRANSPORT=inprocess at build time produces a static bundle (no API server) for static hosting.
  if (import.meta.env.VITE_TRANSPORT === 'inprocess') return true;
  const params = new URLSearchParams(window.location.search);
  return params.get('transport') === 'inprocess' || window.location.protocol === 'file:';
}

export async function chooseTransport(forceInProcess = false): Promise<TransportChoice> {
  if (forceInProcess || wantsInProcess()) {
    return { client: new ApiClient(new InProcessTransport()), probeError: null, autoFallback: false };
  }
  const http: Transport = new HttpTransport('/graphql', 2500);
  const client = new ApiClient(http);
  try {
    await client.apiInfo();
    return { client, probeError: null, autoFallback: false };
  } catch (err) {
    const message = (err as Error).message;
    if (!isLocalHost()) {
      return { client: new ApiClient(new InProcessTransport()), probeError: message, autoFallback: true };
    }
    return { client, probeError: message, autoFallback: false };
  }
}
