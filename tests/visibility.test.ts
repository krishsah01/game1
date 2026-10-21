import { describe, expect, it } from 'vitest';
import { VISIBLE_CONFIRM_TICKS } from '../src/shared/tuning.ts';
import { hold, makeWorld, observed, seconds, sources, ticks } from './helpers.ts';

describe('visibility and knowledge separation', () => {
  it('hidden battlefield: partition hides the patrol and the bag; player snapshot lists nothing dynamic', () => {
    const w = makeWorld('hidden-battlefield');
    seconds(w, 4);
    expect(observed(w, 'enemy-b')).toBe(false);
    expect(observed(w, 'gear-b')).toBe(false);
    const player = w.snapshot('player');
    expect(player.entities).toHaveLength(0);
    expect(player.dev).toBeNull();
    const dev = w.snapshot('developer');
    // Camera devices are dynamic entities too (developer view lists them; player view only when observed).
    expect(dev.entities.map((e) => e.id).sort()).toEqual(['cam-01', 'enemy-b', 'gear-b']);
    expect(dev.dev?.rawTruth.find((t) => t.id === 'enemy-b')?.observed).toBe(false);
    // Static architecture is still present in the seed and lit values exist for every collider.
    expect(player.staticLit.size).toBe(w.scene.colliders.length);
  });

  it('the patrol is observed directly once the player stands in the far room', () => {
    const w = makeWorld('hidden-battlefield');
    w.command({ type: 'teleportPlayer', x: 8.8, z: 0, facingX: -1 });
    ticks(w, VISIBLE_CONFIRM_TICKS + 2);
    expect(observed(w, 'enemy-b')).toBe(true);
    expect(sources(w, 'enemy-b')).toEqual(['player']);
  });

  it('field of view matters: facing away from the patrol hides it', () => {
    const w = makeWorld('hidden-battlefield');
    w.command({ type: 'teleportPlayer', x: 8.8, z: 0, facingX: 1 });
    ticks(w, 10);
    expect(observed(w, 'enemy-b')).toBe(false);
    expect(w.sampleResultsFor('enemy-b').every((s) => s.reason === 'fov')).toBe(true);
  });

  it('loss of sight is published immediately, with no confirmation lag', () => {
    const w = makeWorld('smoke-sound', { cameraStatus: 'OFFLINE' });
    ticks(w, 10);
    expect(observed(w, 'enemy-b')).toBe(true);
    // Turn away: the next tick must already drop the contact.
    w.command({ type: 'teleportPlayer', x: 8.8, z: 0, facingX: 1 });
    w.step();
    expect(observed(w, 'enemy-b')).toBe(false);
    expect(w.snapshot('player').entities).toHaveLength(0);
  });

  it('smoke blocks every visual source but does not stop a bullet', () => {
    const w = makeWorld('smoke-sound', { baseSwayAmplitude: 0 });
    ticks(w, 10);
    expect(observed(w, 'enemy-b')).toBe(true);
    expect(sources(w, 'enemy-b').sort()).toEqual(['cam-01', 'player']);
    w.applyConfig({ ...w.config, smokeEnabled: true });
    ticks(w, 2);
    expect(observed(w, 'enemy-b')).toBe(false);
    expect(w.sampleResultsFor('enemy-b').every((s) => s.reason === 'smoke')).toBe(true);
    // Aim straight at the (hidden) enemy's true chest position: the ray passes through smoke.
    const enemy = w.actors.find((a) => a.id === 'enemy-b')!;
    hold(w, { pointerWorld: { x: enemy.position.x, y: 1.2 } });
    w.command({ type: 'setSelectedDepth', depth: enemy.position.z });
    w.step();
    const r = w.command({ type: 'fire' });
    expect(r?.hit?.id).toBe('enemy-b');
    // Player-mode tracer must not stop on the unobserved actor.
    const snap = w.snapshot('player');
    const t = snap.tracers[0]!.tracer;
    expect(t.hitObserved).toBe(false);
    expect(Math.abs(t.publicEnd.x - enemy.position.x)).toBeGreaterThan(0.5);
    expect(snap.entities.find((e) => e.id === 'enemy-b')).toBeUndefined();
  });

  it('noise pulses report rough direction only', () => {
    const w = makeWorld('smoke-sound');
    w.applyConfig({ ...w.config, smokeEnabled: true });
    seconds(w, 3);
    expect(w.noise.pulses.length + w.log.filter((l) => l.text.startsWith('Noise pulse')).length).toBeGreaterThan(0);
    for (const p of w.noise.pulses) {
      expect([-1, 1]).toContain(p.direction);
      expect(p.loudness).toBeGreaterThan(0);
      expect(p).not.toHaveProperty('position');
    }
  });
});
