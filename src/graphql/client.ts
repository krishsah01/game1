/**
 * Small typed client over a Transport. Every call is recorded (name, status,
 * duration, revision) for the developer API panel. GraphQL `errors` are
 * raised as GraphQLClientError with the server's error code.
 */
import type { DemoConfigPatch, DemoSession, Scenario, ScenarioSummary } from '../shared/types.ts';
import { API_INFO, CREATE_SESSION, RESET_SESSION, SCENARIO, SCENARIOS, SESSION, UPDATE_CONFIG, operationName } from './documents.ts';
import { TransportError, type GraphQLErrorShape, type Transport } from './transport.ts';

export class GraphQLClientError extends Error {
  readonly code: string;
  readonly extensions: Record<string, unknown>;
  readonly transport: boolean;
  constructor(message: string, code: string, extensions: Record<string, unknown> = {}, transport = false) {
    super(message);
    this.name = 'GraphQLClientError';
    this.code = code;
    this.extensions = extensions;
    this.transport = transport;
  }
  static fromErrors(errors: GraphQLErrorShape[]): GraphQLClientError {
    const first = errors[0]!;
    const code = typeof first.extensions?.code === 'string' ? first.extensions.code : 'GRAPHQL_ERROR';
    return new GraphQLClientError(first.message, code, first.extensions ?? {});
  }
}

export interface OperationRecord {
  id: number;
  name: string;
  kind: 'query' | 'mutation';
  status: 'pending' | 'ok' | 'error';
  startedAt: number;
  durationMs: number | null;
  message: string | null;
  code: string | null;
  revision: number | null;
}

const RECORD_CAP = 40;

export interface ApiInfo {
  name: string;
  version: string;
  sessionCount: number;
  sessionCap: number;
}

export class ApiClient {
  private records: OperationRecord[] = [];
  private nextId = 1;
  private listeners = new Set<() => void>();

  constructor(public transport: Transport) {}

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getRecords(): OperationRecord[] {
    return this.records;
  }

  private emit(): void {
    for (const l of this.listeners) l();
  }

  private record(partial: Omit<OperationRecord, 'id'>): OperationRecord {
    const rec: OperationRecord = { id: this.nextId++, ...partial };
    this.records = [...this.records, rec].slice(-RECORD_CAP);
    this.emit();
    return rec;
  }

  private finish(rec: OperationRecord, patch: Partial<OperationRecord>): void {
    this.records = this.records.map((r) => (r.id === rec.id ? { ...r, ...patch } : r));
    this.emit();
  }

  async run<T>(document: string, variables?: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
    const name = operationName(document);
    const kind: OperationRecord['kind'] = /^\s*mutation/.test(document) ? 'mutation' : 'query';
    const started = performance.now();
    const rec = this.record({ name, kind, status: 'pending', startedAt: Date.now(), durationMs: null, message: null, code: null, revision: null });
    try {
      const res = await this.transport.execute<T>(document, variables, signal);
      if (res.errors && res.errors.length) {
        const err = GraphQLClientError.fromErrors(res.errors);
        this.finish(rec, { status: 'error', durationMs: performance.now() - started, message: err.message, code: err.code });
        throw err;
      }
      if (res.data === undefined || res.data === null) {
        const err = new GraphQLClientError('GraphQL response carried no data.', 'EMPTY_RESPONSE');
        this.finish(rec, { status: 'error', durationMs: performance.now() - started, message: err.message, code: err.code });
        throw err;
      }
      const revision = extractRevision(res.data);
      this.finish(rec, { status: 'ok', durationMs: performance.now() - started, revision });
      return res.data;
    } catch (err) {
      if (err instanceof GraphQLClientError) throw err;
      const message = err instanceof TransportError ? err.message : (err as Error).message;
      this.finish(rec, { status: 'error', durationMs: performance.now() - started, message, code: 'TRANSPORT' });
      throw new GraphQLClientError(message, 'TRANSPORT', {}, true);
    }
  }

  async apiInfo(signal?: AbortSignal): Promise<ApiInfo> {
    return (await this.run<{ apiInfo: ApiInfo }>(API_INFO, undefined, signal)).apiInfo;
  }

  async scenarios(signal?: AbortSignal): Promise<ScenarioSummary[]> {
    return (await this.run<{ scenarios: ScenarioSummary[] }>(SCENARIOS, undefined, signal)).scenarios;
  }

  async scenario(id: string, signal?: AbortSignal): Promise<Scenario> {
    const data = await this.run<{ scenario: Scenario | null }>(SCENARIO, { id }, signal);
    if (!data.scenario) throw new GraphQLClientError(`Scenario "${id}" not found.`, 'NOT_FOUND');
    return data.scenario;
  }

  async session(id: string, signal?: AbortSignal): Promise<DemoSession | null> {
    return (await this.run<{ session: DemoSession | null }>(SESSION, { id }, signal)).session;
  }

  async createSession(scenarioId: string, signal?: AbortSignal): Promise<DemoSession> {
    return (await this.run<{ createSession: DemoSession }>(CREATE_SESSION, { scenarioId }, signal)).createSession;
  }

  async updateConfig(sessionId: string, expectedRevision: number, patch: DemoConfigPatch, signal?: AbortSignal): Promise<DemoSession> {
    return (await this.run<{ updateConfig: DemoSession }>(UPDATE_CONFIG, { sessionId, expectedRevision, patch }, signal)).updateConfig;
  }

  async resetSession(sessionId: string, expectedRevision: number, signal?: AbortSignal): Promise<DemoSession> {
    return (await this.run<{ resetSession: DemoSession }>(RESET_SESSION, { sessionId, expectedRevision }, signal)).resetSession;
  }
}

function extractRevision(data: unknown): number | null {
  if (!data || typeof data !== 'object') return null;
  for (const value of Object.values(data as Record<string, unknown>)) {
    if (value && typeof value === 'object' && typeof (value as { revision?: unknown }).revision === 'number') {
      return (value as { revision: number }).revision;
    }
  }
  return null;
}
