import { graphql, type ExecutionResult } from 'graphql';
import { createYoga } from 'graphql-yoga';
import { describe, expect, it } from 'vitest';
import { buildSchema } from '../server/schema.ts';
import { createStore } from '../server/store.ts';
import { SCENARIOS } from '../src/shared/scenarios.ts';
import { CREATE_SESSION, RESET_SESSION, SCENARIO, SCENARIOS as SCENARIOS_QUERY, UPDATE_CONFIG } from '../src/graphql/documents.ts';

function harness() {
  let t = 1_000_000;
  const store = createStore({ now: () => (t += 1000), cap: 3 });
  const schema = buildSchema(store);
  const run = (source: string, variableValues?: Record<string, unknown>) => graphql({ schema, source, variableValues }) as Promise<ExecutionResult<any>>;
  return { store, schema, run };
}

describe('GraphQL contract', () => {
  it('scenarios query returns the catalogue with typed fields', async () => {
    const { run } = harness();
    const r = await run(SCENARIOS_QUERY);
    expect(r.errors).toBeUndefined();
    expect(r.data!.scenarios).toHaveLength(SCENARIOS.length);
    expect(r.data!.scenarios[0]).toMatchObject({ id: 'hidden-battlefield', kind: 'HIDDEN_BATTLEFIELD' });
  });

  it('scenario query returns a full typed scene seed', async () => {
    const { run } = harness();
    const r = await run(SCENARIO, { id: 'depth-shot' });
    expect(r.errors).toBeUndefined();
    const s = r.data!.scenario;
    expect(s.initialScene.colliders.length).toBeGreaterThan(10);
    expect(s.initialScene.entities.find((e: any) => e.id === 'enemy-c')).toMatchObject({ kind: 'ENEMY', facingX: -1, script: 'STATIC' });
    expect(s.initialScene.recon.id).toBe('cam-01');
    expect(s.initialScene.colliders.find((c: any) => c.id === 'barrier-a')).toMatchObject({ isCover: true, isVaultable: true, visualRole: 'lowwall' });
    expect(s.initialScene.colliders.find((c: any) => c.id === 'jamb-c-far')).toMatchObject({ isVaultable: false });
    expect(s.defaultConfig.cameraStatus).toBe('OFFLINE');
    expect(s.initialScene.entities.every((e: any) => e.facingX === 1 || e.facingX === -1)).toBe(true);
  });

  it('unknown scenario id is null for the query and NOT_FOUND for createSession', async () => {
    const { run } = harness();
    expect((await run(SCENARIO, { id: 'nope' })).data!.scenario).toBeNull();
    const r = await run(CREATE_SESSION, { scenarioId: 'nope' });
    expect(r.errors?.[0]?.extensions?.code).toBe('NOT_FOUND');
  });

  it('createSession → updateConfig increments revision and changes the value; the server never substitutes a scenario', async () => {
    const { run } = harness();
    const c = await run(CREATE_SESSION, { scenarioId: 'camera-intel' });
    expect(c.errors).toBeUndefined();
    const session = c.data!.createSession;
    expect(session.revision).toBe(1);
    expect(session.scenarioId).toBe('camera-intel');
    expect(session.config.cameraStatus).toBe('OFFLINE');
    const u = await run(UPDATE_CONFIG, { sessionId: session.id, expectedRevision: 1, patch: { cameraStatus: 'ONLINE', visionRange: 30 } });
    expect(u.errors).toBeUndefined();
    expect(u.data!.updateConfig.revision).toBe(2);
    expect(u.data!.updateConfig.config.cameraStatus).toBe('ONLINE');
    expect(u.data!.updateConfig.config.visionRange).toBe(30);
    expect(u.data!.updateConfig.config.visionFovDegrees).toBe(100); // untouched
  });

  it('rejects invalid values, explicit null, unknown sessions and stale revisions with clear codes', async () => {
    const { run } = harness();
    const { id } = (await run(CREATE_SESSION, { scenarioId: 'depth-shot' })).data!.createSession;

    const bad = await run(UPDATE_CONFIG, { sessionId: id, expectedRevision: 1, patch: { visionRange: -5 } });
    expect(bad.errors?.[0]?.extensions?.code).toBe('BAD_USER_INPUT');
    expect(bad.errors?.[0]?.message).toMatch(/visionRange/);

    const nan = await run(UPDATE_CONFIG, { sessionId: id, expectedRevision: 1, patch: { swayFrequencyHz: 99 } });
    expect(nan.errors?.[0]?.extensions?.code).toBe('BAD_USER_INPUT');

    const nul = await run(UPDATE_CONFIG, { sessionId: id, expectedRevision: 1, patch: { smokeEnabled: null } });
    expect(nul.errors?.[0]?.extensions?.reason).toBe('NULL_PATCH_FIELD');

    const unknown = await run(UPDATE_CONFIG, { sessionId: 'sess-missing', expectedRevision: 1, patch: { smokeEnabled: true } });
    expect(unknown.errors?.[0]?.extensions?.code).toBe('NOT_FOUND');

    const ok = await run(UPDATE_CONFIG, { sessionId: id, expectedRevision: 1, patch: { smokeEnabled: true } });
    expect(ok.data!.updateConfig.revision).toBe(2);
    const stale = await run(UPDATE_CONFIG, { sessionId: id, expectedRevision: 1, patch: { smokeEnabled: false } });
    expect(stale.errors?.[0]?.extensions?.code).toBe('REVISION_CONFLICT');
    expect(stale.errors?.[0]?.extensions?.currentRevision).toBe(2);
    // A failed mutation left the config untouched (atomic).
    const after = await run(`query($id: ID!){ session(id:$id){ revision config { smokeEnabled visionRange } } }`, { id });
    expect(after.data!.session).toEqual({ revision: 2, config: { smokeEnabled: true, visionRange: 24 } });
  });

  it('two sessions are isolated and reset restores defaults with a new revision', async () => {
    const { run } = harness();
    const a = (await run(CREATE_SESSION, { scenarioId: 'smoke-sound' })).data!.createSession;
    const b = (await run(CREATE_SESSION, { scenarioId: 'smoke-sound' })).data!.createSession;
    expect(a.id).not.toBe(b.id);
    await run(UPDATE_CONFIG, { sessionId: a.id, expectedRevision: 1, patch: { smokeEnabled: true } });
    const bq = await run(`query($id: ID!){ session(id:$id){ revision config { smokeEnabled } } }`, { id: b.id });
    expect(bq.data!.session).toEqual({ revision: 1, config: { smokeEnabled: false } });
    const reset = await run(RESET_SESSION, { sessionId: a.id, expectedRevision: 2 });
    expect(reset.errors).toBeUndefined();
    expect(reset.data!.resetSession.revision).toBe(3);
    expect(reset.data!.resetSession.config.smokeEnabled).toBe(false);
  });

  it('evicts least-recently-used sessions beyond the cap', async () => {
    const { run, store } = harness();
    const ids: string[] = [];
    for (let i = 0; i < 4; i++) ids.push((await run(CREATE_SESSION, { scenarioId: 'depth-shot' })).data!.createSession.id);
    expect(store.sessionCount()).toBe(3);
    expect(store.getSession(ids[0]!)).toBeUndefined();
    expect(store.getSession(ids[3]!)).toBeDefined();
  });

  it('serves over HTTP through GraphQL Yoga with standard data/errors envelopes', async () => {
    const { schema } = harness();
    const yoga = createYoga({ schema, graphqlEndpoint: '/graphql', maskedErrors: false, logging: false });
    const post = async (query: string, variables?: Record<string, unknown>) => {
      const res = await yoga.fetch('http://localhost/graphql', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ query, variables }),
      });
      return { status: res.status, body: (await res.json()) as ExecutionResult<any> };
    };
    const ok = await post(SCENARIOS_QUERY);
    expect(ok.status).toBe(200);
    expect(ok.body.data!.scenarios).toHaveLength(SCENARIOS.length);
    const err = await post(UPDATE_CONFIG, { sessionId: 'nope', expectedRevision: 1, patch: {} });
    expect(err.body.errors?.[0]?.extensions?.code).toBe('NOT_FOUND');
  });
});
