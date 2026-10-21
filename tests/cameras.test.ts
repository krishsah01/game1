import { graphql } from 'graphql';
import { describe, expect, it } from 'vitest';
import { buildSchema } from '../server/schema.ts';
import { createStore } from '../server/store.ts';
import { SessionController } from '../src/app/sessionController.ts';
import { ApiClient } from '../src/graphql/client.ts';
import type { GraphQLResponse, Transport } from '../src/graphql/transport.ts';
import { SCENARIOS } from '../src/shared/scenarios.ts';
import { CAMERA } from '../src/shared/tuning.ts';
import type { World } from '../src/simulation/world.ts';
import { hold, makeWorld, observed, sources, ticks } from './helpers.ts';

const cam = (w: World, id: string) => w.cameras.find((c) => c.seed.id === id)!;
const opforSees = (w: World, id: string) => w.opforKnowledge.observations.get(id)?.observed ?? false;
const opforSources = (w: World, id: string) => w.opforKnowledge.observations.get(id)?.sources ?? [];

/** Crouched behind barrier-a in the camera-war preset (hidden from OPFOR A). */
function hiddenAtBarrier(): World {
  const w = makeWorld('camera-war', { baseSwayAmplitude: 0 });
  w.command({ type: 'teleportPlayer', x: -11.5, z: 0, facingX: 1 });
  w.command({ type: 'setStance', stance: 'CROUCHED' });
  ticks(w, 10);
  return w;
}

describe('v0.2.2 cameras: placement', () => {
  it('every preplaced camera sits on the lane plane (depth 0)', () => {
    for (const s of SCENARIOS) for (const c of s.initialScene.cameras) expect(c.position.z).toBe(CAMERA.z);
  });

  it('a deployed camera snaps onto the top of the cover you hide behind, at depth 0', () => {
    const w = hiddenAtBarrier();
    expect(w.player.cover.state).toBe('hidden');
    w.command({ type: 'equip', slot: 'CAMERA' });
    expect(w.player.equipped).toBe('CAMERA');
    w.command({ type: 'deployCamera', at: { x: -10, y: 1.5 } });
    const placed = w.cameras.find((c) => c.deployed)!;
    expect(placed).toBeDefined();
    expect(placed.seed).toMatchObject({ team: 'FRIENDLY', mount: 'COVER', label: 'CAM 02' });
    expect(placed.seed.position.y).toBeCloseTo(1.1 + CAMERA.mountOffset, 5);
    expect(placed.seed.position.z).toBe(0);
    expect(w.player.cameraCharges).toBe(1);
  });

  it('snaps to the ground and the ceiling; refuses out of reach, through walls and in empty air', () => {
    const w = makeWorld('camera-war');
    const ground = w.placementAt({ x: -13.2, y: 0.4 });
    expect(ground).toMatchObject({ ok: true, mount: 'GROUND' });
    expect(ground.position!.y).toBeCloseTo(CAMERA.mountOffset, 5);
    // The ceiling is found but is beyond arm's reach from the floor.
    const ceiling = w.placementAt({ x: -12.6, y: 4.6 });
    expect(ceiling.mount).toBe('CEILING');
    expect(ceiling.ok).toBe(false);
    expect(ceiling.reason).toMatch(/OUT OF REACH/);
    // Mid-air with nothing within the snap radius.
    expect(w.placementAt({ x: -12.6, y: 2.6 })).toMatchObject({ ok: false, position: null });

    const wall = makeWorld('hidden-battlefield');
    wall.command({ type: 'teleportPlayer', x: 0.3, z: 0, facingX: 1 });
    ticks(wall, 2);
    const through = wall.placementAt({ x: 1.6, y: 0.3 });
    expect(through.ok).toBe(false);
    expect(through.reason).toMatch(/NO CLEAR REACH · partition-b/);
  });

  it('LMB places the camera while the camera slot is equipped; the inventory runs out', () => {
    const w = makeWorld('camera-war');
    w.command({ type: 'equip', slot: 'CAMERA' });
    hold(w, { pointerWorld: { x: -13.4, y: 0.3 } });
    ticks(w, 2);
    expect(w.player.placement?.ok).toBe(true);
    const ammo = w.player.ammo;
    w.command({ type: 'fire' });
    hold(w, { pointerWorld: { x: -11.8, y: 0.3 } });
    ticks(w, 2);
    w.command({ type: 'fire' });
    expect(w.player.ammo).toBe(ammo); // placing is not firing
    expect(w.cameras.filter((c) => c.deployed)).toHaveLength(2);
    expect(w.player.cameraCharges).toBe(0);
    expect(w.player.equipped).toBe('RIFLE');
    w.command({ type: 'equip', slot: 'CAMERA' });
    expect(w.player.equipped).toBe('RIFLE');
  });
});

describe('v0.2.2 cameras: link, sight and destruction', () => {
  it('a deployed camera feeds sight only while the friendly link is live', () => {
    const w = hiddenAtBarrier();
    expect(observed(w, 'enemy-a')).toBe(false);
    w.command({ type: 'equip', slot: 'CAMERA' });
    w.command({ type: 'deployCamera', at: { x: -10, y: 1.5 } });
    ticks(w, 10);
    expect(observed(w, 'enemy-a')).toBe(false);
    w.applyConfig({ ...w.config, cameraStatus: 'ONLINE' });
    ticks(w, 10);
    expect(observed(w, 'enemy-a')).toBe(true);
    expect(sources(w, 'enemy-a')).toEqual(['cam-d1']);
  });

  it('shooting the opposing camera destroys it', () => {
    const w = makeWorld('camera-war', { baseSwayAmplitude: 0 });
    const target = cam(w, 'cam-op1').seed.position;
    hold(w, { pointerWorld: { x: target.x, y: target.y }, aim: true });
    ticks(w, 10);
    expect(observed(w, 'cam-op1')).toBe(true);
    const result = w.command({ type: 'fire' });
    expect(result?.hit).toMatchObject({ kind: 'device', id: 'cam-op1' });
    expect(cam(w, 'cam-op1').destroyed).toBe(true);
    expect(w.snapshot('player').message).toBe('CAMERA DESTROYED · OPFOR CAM');
    // The wreck is no longer a target: the same shot now reaches the ceiling.
    expect(w.command({ type: 'fire' })?.hit?.kind).toBe('collider');
  });

  it('a destroyed friendly camera stops feeding sight even with the link live', () => {
    const w = makeWorld('camera-intel', { cameraStatus: 'ONLINE', baseSwayAmplitude: 0 });
    ticks(w, 10);
    expect(observed(w, 'enemy-b')).toBe(true);
    w.command({ type: 'teleportPlayer', x: 8.2, z: 0, facingX: 1 });
    const target = cam(w, 'cam-01').seed.position;
    hold(w, { pointerWorld: { x: target.x, y: target.y }, aim: true });
    ticks(w, 6);
    w.command({ type: 'fire' });
    expect(cam(w, 'cam-01').destroyed).toBe(true);
    ticks(w, 2);
    expect(observed(w, 'enemy-b')).toBe(false);
    expect(w.snapshot('player').cameras.find((c) => c.id === 'cam-01')?.status).toBe('DESTROYED');
  });

  it('an unobserved opposing camera is a dynamic object: absent from the player snapshot', () => {
    const w = makeWorld('camera-war');
    w.command({ type: 'teleportPlayer', x: -12.6, z: 0, facingX: -1 }); // facing away
    ticks(w, 10);
    const p = w.snapshot('player');
    expect(p.entities.find((e) => e.id === 'cam-op1')).toBeUndefined();
    expect(p.cameras.find((c) => c.id === 'cam-op1')).toBeUndefined();
    expect(w.snapshot('developer').cameras.find((c) => c.id === 'cam-op1')?.team).toBe('OPPOSING');
  });
});

describe('v0.2.2 cameras: what the opposition sees', () => {
  it('OPFOR learns of a friendly camera only through its own view cones', () => {
    const w = hiddenAtBarrier();
    w.command({ type: 'equip', slot: 'CAMERA' });
    w.command({ type: 'deployCamera', at: { x: -10, y: 1.5 } }); // on top of barrier-a, in OPFOR A's view
    ticks(w, 10);
    expect(opforSees(w, 'cam-d1')).toBe(true);
    expect(opforSources(w, 'cam-d1')).toContain('enemy-a');
    // Turn OPFOR A away and blind its camera: nobody on their side sees the device any more.
    w.actors.find((a) => a.id === 'enemy-a')!.facingX = 1;
    cam(w, 'cam-op1').destroyed = true;
    ticks(w, 2);
    expect(opforSees(w, 'cam-d1')).toBe(false);
  });

  it('a camera hidden behind cover from OPFOR A is spotted only by the overhead OPFOR camera', () => {
    const w = makeWorld('camera-war');
    w.command({ type: 'equip', slot: 'CAMERA' });
    w.command({ type: 'deployCamera', at: { x: -13.4, y: 0.3 } }); // on the floor behind barrier-a
    ticks(w, 10);
    expect(opforSources(w, 'cam-d1')).toEqual(['cam-op1']);
    cam(w, 'cam-op1').destroyed = true;
    ticks(w, 2);
    expect(opforSees(w, 'cam-d1')).toBe(false);
    // Developer view reports it; player view never does.
    expect(w.snapshot('player').cameras.find((c) => c.id === 'cam-d1')?.spottedBy).toEqual([]);
    expect(w.snapshot('player').dev).toBeNull();
  });
});

describe('v0.2.2 cameras: U toggles the link through the API', () => {
  function transport(): Transport {
    const schema = buildSchema(createStore({ idPrefix: 'u' }));
    return {
      kind: 'inprocess',
      label: 'test',
      async execute<T>(document: string, variables?: Record<string, unknown>): Promise<GraphQLResponse<T>> {
        const res = await graphql({ schema, source: document, variableValues: variables });
        return { data: res.data as T, errors: res.errors?.map((e) => ({ message: e.message, extensions: e.extensions as Record<string, unknown> })) };
      },
    };
  }

  it('toggles ONLINE ⇄ OFFLINE with a real updateConfig mutation and refuses a jammed link', async () => {
    const c = new SessionController(new ApiClient(transport()));
    await c.selectScenario('camera-intel');
    expect(c.world!.config.cameraStatus).toBe('OFFLINE');
    const on = await c.toggleCameraLink();
    expect(on?.config.cameraStatus).toBe('ONLINE');
    expect(on?.revision).toBe(2);
    expect(c.world!.config.cameraStatus).toBe('ONLINE');
    const off = await c.toggleCameraLink();
    expect(off?.config.cameraStatus).toBe('OFFLINE');
    await c.updateConfig({ cameraStatus: 'JAMMED' });
    expect(await c.toggleCameraLink()).toBeNull();
    expect(c.world!.config.cameraStatus).toBe('JAMMED');
    expect(c.world!.snapshot('player').message).toMatch(/JAMMED/);
  });
});
