/**
 * GraphQL transport interface. Two implementations share it:
 *   - HttpTransport: POSTs to the same-origin /graphql URL (proxied to the
 *     local GraphQL Yoga server).
 *   - InProcessTransport (inprocess.ts): executes the identical schema and
 *     resolvers inside the browser for environments that cannot host Node.
 * Swapping the transport never changes game mechanics.
 */

export interface GraphQLErrorShape {
  message: string;
  extensions?: Record<string, unknown>;
  path?: (string | number)[];
}

export interface GraphQLResponse<T> {
  data?: T | null;
  errors?: GraphQLErrorShape[];
}

export interface Transport {
  readonly kind: 'http' | 'inprocess';
  /** Short label for the status chip, e.g. "HTTP /graphql" or "in-process demo". */
  readonly label: string;
  execute<T>(document: string, variables?: Record<string, unknown>, signal?: AbortSignal): Promise<GraphQLResponse<T>>;
}

export class TransportError extends Error {
  constructor(
    message: string,
    readonly status: number | null = null,
  ) {
    super(message);
    this.name = 'TransportError';
  }
}

export class HttpTransport implements Transport {
  readonly kind = 'http' as const;
  readonly label: string;

  constructor(
    private readonly url = '/graphql',
    private readonly timeoutMs = 6000,
  ) {
    this.label = `HTTP ${url}`;
  }

  async execute<T>(document: string, variables?: Record<string, unknown>, signal?: AbortSignal): Promise<GraphQLResponse<T>> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const onAbort = () => controller.abort();
    signal?.addEventListener('abort', onAbort);
    try {
      let res: Response;
      try {
        res = await fetch(this.url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'application/graphql-response+json, application/json' },
          body: JSON.stringify({ query: document, variables }),
          signal: controller.signal,
        });
      } catch (err) {
        if (controller.signal.aborted) throw new TransportError('GraphQL request timed out or was aborted.');
        throw new TransportError(`GraphQL endpoint unreachable: ${(err as Error).message}`);
      }
      const text = await res.text();
      let json: GraphQLResponse<T>;
      try {
        json = JSON.parse(text) as GraphQLResponse<T>;
      } catch {
        throw new TransportError(`GraphQL endpoint returned HTTP ${res.status} without a JSON body (is the API server running?).`, res.status);
      }
      // HTTP success alone is never application success: callers inspect data/errors.
      if (!res.ok && !json.errors) throw new TransportError(`GraphQL endpoint returned HTTP ${res.status}.`, res.status);
      return json;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
  }
}
