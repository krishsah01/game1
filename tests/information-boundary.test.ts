import { describe, expect, it } from 'vitest';
import { aabbFromBounds } from '../src/shared/geometry.ts';
import { bounds } from '../src/shared/types.ts';
import { resolveShot } from '../src/simulation/shots.ts';
import { hold, makeWorld, observed, seconds, ticks } from './helpers.ts';

/**
 * Regressions found by adversarial review: anchors pressed into walls, and
 * hidden-state leaks through shot records and feedback.
 */
describe('muzzle anchor stays outside solid geometry', () => {
  it('pressed against the barrier in observe state the muzzle stops at the face and the shot hits concrete', () => {
    const w = makeWorld('exposure-ladder', { baseSwayAmplitude: 0 });
    w.command({ type: 'setStance', stance: 'STANDING' });
    hold(w, { moveX: 1 });
    seconds(w, 2); // walk until blocked by barrier-a
    expect(w.player.lastBlockedBy).toBe('barrier-a');
    w.command({ type: 'setStance', stance: 'CROUCHED' });
    hold(w, { observe: true, pointerWorld: { x: -6.2, y: 1.2 } });
    ticks(w, 5);
    expect(w.player.cover.state).toBe('observe');
    const barrier = aabbFromBounds(bounds(-10, 0.55, 0, 1.6, 1.1, 0.6));
    expect(w.player.cover.muzzle.x).toBeLessThan(barrier.min.x);
    expect(observed(w, 'enemy-a')).toBe(true);
    const r = w.command({ type: 'fire' })!;
    expect(r.hit?.id).toBe('barrier-a');
  });

  it('pressed against the barrier in aim-over state the muzzle clears the top and the shot reaches the target', () => {
    const w = makeWorld('exposure-ladder', { baseSwayAmplitude: 0 });
    w.command({ type: 'setStance', stance: 'STANDING' });
    hold(w, { moveX: 1 });
    seconds(w, 2);
    w.command({ type: 'setStance', stance: 'CROUCHED' });
    hold(w, { aim: true, pointerWorld: { x: -6.2, y: 1.2 } });
    ticks(w, 5);
    expect(w.player.cover.state).toBe('aimOver');
    expect(w.player.cover.anchors.muzzleForward).toBeCloseTo(0.6);
    const r = w.command({ type: 'fire' })!;
    expect(r.hit?.id).toBe('enemy-a');
  });

  it('a collider that contains the shot origin is an immediate obstruction', () => {
    const box = aabbFromBounds(bounds(0, 1, 0, 2, 2, 2));
    const r = resolveShot({ x: 0, y: 1, z: 0 }, { x: 10, y: 1, z: 0 }, [{ kind: 'collider', id: 'wall', label: 'wall', box }], { x: 1, y: 0, z: 0 });
    expect(r.hit?.id).toBe('wall');
    expect(r.hit?.t).toBe(0);
  });
});

describe('player presentation never carries hidden shot data', () => {
  const hiddenHit = () => {
    const w = makeWorld('smoke-sound', { baseSwayAmplitude: 0, smokeEnabled: true });
    ticks(w, 3);
    const enemy = w.actors.find((a) => a.id === 'enemy-b')!;
    expect(observed(w, 'enemy-b')).toBe(false);
    hold(w, { pointerWorld: { x: enemy.position.x, y: 1.2 } });
    w.command({ type: 'setSelectedDepth', depth: enemy.position.z });
    w.step();
    return { w, enemy };
  };

  it('tracer records in player mode show only the public outcome', () => {
    const { w, enemy } = hiddenHit();
    const r = w.command({ type: 'fire' })!;
    expect(r.hit?.id).toBe('enemy-b'); // simulation truth
    const player = w.snapshot('player').tracers[0]!.tracer;
    expect(player.hitId).not.toBe('enemy-b');
    expect(player.hitKind).not.toBe('actor');
    expect(player.trueEnd).toEqual(player.publicEnd);
    expect(Math.abs(player.trueEnd.x - enemy.position.x)).toBeGreaterThan(0.5);
    const dev = w.snapshot('developer').tracers[0]!.tracer;
    expect(dev.hitId).toBe('enemy-b');
  });

  it('feedback for a hidden hit is identical to the shot reaching the wall behind', () => {
    const { w } = hiddenHit();
    w.command({ type: 'fire' });
    const withBody = w.snapshot('player').message;
    expect(withBody).not.toBe('HIT');
    expect(withBody === null || withBody.startsWith('IMPACT')).toBe(true);
  });

  it('the firing-line test never reports a hidden actor as the target', () => {
    const { w } = hiddenHit();
    w.command({ type: 'testFiringLine' });
    expect(w.snapshot('player').message?.includes('clear to target')).toBe(false);
  });

  it('exposure readout is developer-only', () => {
    const w = makeWorld('exposure-ladder');
    ticks(w, 10);
    expect(w.snapshot('player').player.exposure).toEqual([]);
    expect(w.snapshot('developer').player.exposure.length).toBe(3);
  });
});
