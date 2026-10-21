import { graphql } from 'graphql';
import { describe, expect, it } from 'vitest';
import { buildSchema } from '../server/schema.ts';
import { createStore } from '../server/store.ts';
import { SessionController } from '../src/app/sessionController.ts';
import { ApiClient } from '../src/graphql/client.ts';
import { operationName } from '../src/graphql/documents.ts';
import type { GraphQLResponse, Transport } from '../src/graphql/transport.ts';

/** In-process transport with per-operation artificial delays and an offline switch. */
function fakeTransport(delays: Record<string, number[]> = {}) {
  const schema = buildSchema(createStore({ idPrefix: 't' }));
  const t: Transport & { offline: boolean } = {
    kind: 'inprocess',
    label: 'test',
    offline: false,
    async execute<T>(document: string, variables?: Record<string, unknown>): Promise<GraphQLResponse<T>> {
      const name = operationName(document);
      const queue = delays[name];
      const delay = queue && queue.length ? queue.shift()! : 0;
      if (delay) await new Promise((r) => setTimeout(r, delay));
      if (t.offline) throw new Error('offline');
      const res = await graphql({ schema, source: document, variableValues: variables });
      return { data: res.data as T, errors: res.errors?.map((e) => ({ message: e.message, extensions: e.extensions as Record<string, unknown> })) };
    },
  };
  return t;
}

describe('SessionController', () => {
  it('loads a scenario, creates a session and builds a world', async () => {
    const c = new SessionController(new ApiClient(fakeTransport()));
    await c.loadCatalogue();
    expect(c.getState().scenarios).toHaveLength(7);
    await c.selectScenario('depth-shot');
    const s = c.getState();
    expect(s.phase).toBe('ready');
    expect(s.session?.revision).toBe(1);
    expect(c.world?.scenario.id).toBe('depth-shot');
  });

  it('a stale response from a previous preset cannot overwrite the newly selected one', async () => {
    // First selection answers slowly (300 ms), second quickly.
    const t = fakeTransport({ Scenario: [300, 0], CreateSession: [300, 0] });
    const c = new SessionController(new ApiClient(t));
    const first = c.selectScenario('hidden-battlefield');
    await new Promise((r) => setTimeout(r, 20));
    const second = c.selectScenario('control-point');
    await Promise.all([first, second]);
    expect(c.getState().scenario?.id).toBe('control-point');
    expect(c.world?.scenario.id).toBe('control-point');
    expect(c.getState().phase).toBe('ready');
  });

  it('config mutation applies the returned settings with an incremented revision and keeps player transforms', async () => {
    const c = new SessionController(new ApiClient(fakeTransport()));
    await c.selectScenario('camera-intel');
    const world = c.world!;
    world.command({ type: 'teleportPlayer', x: 8.8, z: 0, facingX: -1 });
    const next = await c.updateConfig({ cameraStatus: 'ONLINE' });
    expect(next?.revision).toBe(2);
    expect(c.getState().session?.revision).toBe(2);
    expect(world.config.cameraStatus).toBe('ONLINE');
    expect(world.player.position.x).toBeCloseTo(8.8);
  });

  it('serialises mutations and survives a revision conflict with one retry', async () => {
    const t = fakeTransport();
    const client = new ApiClient(t);
    const c = new SessionController(client);
    await c.selectScenario('smoke-sound');
    // Something else bumps the revision behind the controller's back.
    const id = c.getState().session!.id;
    await client.updateConfig(id, 1, { visionRange: 12 });
    const [a, b] = await Promise.all([c.updateConfig({ smokeEnabled: true }), c.updateConfig({ swayFrequencyHz: 1 })]);
    expect(a?.revision).toBe(3);
    expect(b?.revision).toBe(4);
    expect(c.world?.config.smokeEnabled).toBe(true);
    expect(c.world?.config.swayFrequencyHz).toBe(1);
    expect(c.world?.config.visionRange).toBe(12);
  });

  it('invalid config surfaces an understandable error and leaves the world untouched', async () => {
    const c = new SessionController(new ApiClient(fakeTransport()));
    await c.selectScenario('depth-shot');
    await expect(c.updateConfig({ visionRange: -5 })).rejects.toThrow(/visionRange/);
    expect(c.getState().error).toMatch(/BAD_USER_INPUT/);
    expect(c.world?.config.visionRange).toBe(24);
    expect(c.getState().session?.revision).toBe(1);
  });

  it('API loss after a session exists marks disconnected but the local world keeps stepping', async () => {
    const t = fakeTransport();
    const c = new SessionController(new ApiClient(t));
    await c.selectScenario('hidden-battlefield');
    t.offline = true;
    await expect(c.updateConfig({ smokeEnabled: true })).rejects.toThrow();
    expect(c.getState().disconnected).toBe(true);
    const before = c.world!.simTime;
    c.world!.advance(0.5);
    expect(c.world!.simTime).toBeGreaterThan(before);
    c.resetLocally();
    expect(c.world!.simTime).toBe(0);
  });

  it('reset restores defaults, bumps the revision and rebuilds local runtime state', async () => {
    const c = new SessionController(new ApiClient(fakeTransport()));
    await c.selectScenario('lost-contact');
    await c.updateConfig({ cameraStatus: 'OFFLINE' });
    c.world!.advance(1);
    const next = await c.reset();
    expect(next?.revision).toBe(3);
    expect(c.world!.config.cameraStatus).toBe('ONLINE');
    expect(c.world!.simTime).toBe(0);
    expect(c.world!.knowledge.lastKnown).toHaveLength(0);
  });
});
