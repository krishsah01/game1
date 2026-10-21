import { describe, expect, it } from 'vitest';
import { makeWorld, observed, seconds, sources, ticks } from './helpers.ts';

describe('camera intel and last-known records', () => {
  it('camera online reveals the enemy and bag through its own occluded sightlines; jammed/destroyed do not', () => {
    const w = makeWorld('camera-intel');
    ticks(w, 10);
    expect(observed(w, 'enemy-b')).toBe(false);
    w.applyConfig({ ...w.config, cameraStatus: 'ONLINE' });
    ticks(w, 10);
    expect(observed(w, 'enemy-b')).toBe(true);
    expect(sources(w, 'enemy-b')).toEqual(['cam-01']);
    expect(observed(w, 'gear-b')).toBe(true);
    for (const status of ['JAMMED', 'DESTROYED', 'OFFLINE'] as const) {
      w.applyConfig({ ...w.config, cameraStatus: status });
      w.step();
      expect(observed(w, 'enemy-b')).toBe(false);
    }
  });

  it('the camera is not a global reveal: a target behind the tall crate stays hidden from it', () => {
    const w = makeWorld('camera-intel', { cameraStatus: 'ONLINE' });
    const enemy = w.actors.find((a) => a.id === 'enemy-b')!;
    enemy.position.x = 1.8; // behind crate-b-tall from CAM 01's point of view
    ticks(w, 10);
    expect(observed(w, 'enemy-b')).toBe(false);
    const cam = w.snapshot('developer').dev!.cameraSight.find((o) => o.entityId === 'enemy-b')!;
    expect(cam.samples.every((s) => s.reason === 'blocked' && s.blockedBy === 'crate-b-tall')).toBe(true);
  });

  it('camera loss removes only that source; direct sight keeps the target', () => {
    const w = makeWorld('camera-intel', { cameraStatus: 'ONLINE' });
    w.command({ type: 'teleportPlayer', x: 8.8, z: 0, facingX: -1 });
    ticks(w, 10);
    expect(sources(w, 'enemy-b').sort()).toEqual(['cam-01', 'player']);
    w.applyConfig({ ...w.config, cameraStatus: 'JAMMED' });
    ticks(w, 2);
    expect(observed(w, 'enemy-b')).toBe(true);
    expect(sources(w, 'enemy-b')).toEqual(['player']);
  });

  it('lost contact: marker freezes where sight was lost while the hidden enemy keeps moving', () => {
    const w = makeWorld('lost-contact');
    ticks(w, 10);
    expect(observed(w, 'enemy-b')).toBe(true);
    const seenAt = { ...w.actors.find((a) => a.id === 'enemy-b')!.position };
    w.applyConfig({ ...w.config, cameraStatus: 'OFFLINE' });
    w.step();
    expect(observed(w, 'enemy-b')).toBe(false);
    expect(w.knowledge.lastKnown).toHaveLength(1);
    const rec = w.knowledge.lastKnown[0]!;
    expect(rec.position.x).toBeCloseTo(seenAt.x, 2);
    expect(Object.isFrozen(rec)).toBe(true);
    expect(Object.isFrozen(rec.position)).toBe(true);
    seconds(w, 12); // hold 6 s, then the route runs
    const enemy = w.actors.find((a) => a.id === 'enemy-b')!;
    expect(Math.hypot(enemy.position.x - rec.position.x, enemy.position.z - rec.position.z)).toBeGreaterThan(1.5);
    expect(w.knowledge.lastKnown[0]).toBe(rec);
    expect(w.snapshot('player').entities).toHaveLength(0);
    expect(w.snapshot('player').lastKnown[0]!.age).toBeGreaterThan(11);
  });

  it('without user action the route ends in the camera blind spot and still produces a marker', () => {
    const w = makeWorld('lost-contact');
    seconds(w, 14);
    expect(observed(w, 'enemy-b')).toBe(false);
    expect(w.knowledge.lastKnown).toHaveLength(1);
    const enemy = w.actors.find((a) => a.id === 'enemy-b')!;
    expect(enemy.position.x).toBeCloseTo(1.8, 1);
  });

  it('marker age follows simulation time: pause freezes it, expiry removes it, reset clears it', () => {
    const w = makeWorld('lost-contact', { lastKnownSeconds: 3 });
    ticks(w, 10);
    w.applyConfig({ ...w.config, cameraStatus: 'OFFLINE' });
    w.step();
    expect(w.knowledge.lastKnown).toHaveLength(1);
    const ageBefore = w.snapshot('player').lastKnown[0]!.age;
    w.command({ type: 'pause' });
    ticks(w, 120);
    expect(w.snapshot('player').lastKnown[0]!.age).toBeCloseTo(ageBefore);
    w.command({ type: 'resume' });
    seconds(w, 3.5);
    expect(w.knowledge.lastKnown).toHaveLength(0);
    w.applyConfig({ ...w.config, cameraStatus: 'ONLINE' });
    w.reset();
    expect(w.simTime).toBe(0);
    expect(w.knowledge.lastKnown).toHaveLength(0);
    expect(observed(w, 'enemy-b')).toBe(false); // confirmation window not yet elapsed
    ticks(w, 5);
    expect(observed(w, 'enemy-b')).toBe(true);
  });
});
