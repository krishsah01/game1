/**
 * In-process GraphQL fallback.
 *
 * Executes the SAME executable schema and resolvers as server/index.ts using
 * the GraphQL execution library (`graphql()`), with its own in-memory store.
 * It is used when the HTTP endpoint is unreachable (for example when the
 * built app is hosted as static files) and is always labelled
 * "GraphQL: in-process demo" in the UI. It is still real GraphQL execution:
 * documents are parsed, validated and resolved; no direct function calls
 * replace the operations.
 */
import { graphql } from 'graphql';
import { buildSchema } from '../../server/schema.ts';
import { createStore } from '../../server/store.ts';
import type { GraphQLResponse, Transport } from './transport.ts';

export class InProcessTransport implements Transport {
  readonly kind = 'inprocess' as const;
  readonly label = 'in-process demo';
  private readonly schema = buildSchema(createStore({ idPrefix: 'local' }));

  async execute<T>(document: string, variables?: Record<string, unknown>): Promise<GraphQLResponse<T>> {
    const result = await graphql({ schema: this.schema, source: document, variableValues: variables });
    return {
      data: (result.data ?? null) as T | null,
      errors: result.errors?.map((e) => ({ message: e.message, extensions: e.extensions as Record<string, unknown>, path: e.path as (string | number)[] })),
    };
  }
}
