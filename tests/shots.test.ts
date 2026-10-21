import { describe, expect, it } from 'vitest';
import { SLOT_Z_MAX, SLOT_Z_MIN } from '../src/shared/scenarios.ts';
import { hold, makeWorld, ticks } from './helpers.ts';

/**
 * Station C: player at x 6.5 on the lane, 0.7 m slot in the partition at
 * x 10, standing target at x 13.6. Sway amplitude is zeroed so the selected
 * depth alone decides the outcome.
 */
describe('3D shot resolution at the aperture', () => {
  const aimAtTarget = (depth: number) => {
    const w = makeWorld('depth-shot', { baseSwayAmplitude: 0 });
    hold(w, { pointerWorld: { x: 13.6, y: 1.2 } });
    w.command({ type: 'setSelectedDepth', depth });
    ticks(w, 3);
    return w;
  };

  it('selected depth MID: clear hit through the slot', () => {
    const w = aimAtTarget(0);
    const r = w.command({ type: 'fire' })!;
    expect(r.hit?.kind).toBe('actor');
    expect(r.hit?.id).toBe('enemy-c');
    expect(r.aimPoint.z).toBeCloseTo(0);
  });

  it('selected depth FAR: the same screen aim strikes the far door jamb', () => {
    const w = aimAtTarget(-0.75);
    const r = w.command({ type: 'fire' })!;
    expect(r.hit?.id).toBe('jamb-c-far');
    // The ray enters the slot and strikes the jamb's slot-side face inside the wall thickness.
    expect(r.hit!.point.x).toBeGreaterThanOrEqual(9.8 - 1e-6);
    expect(r.hit!.point.x).toBeLessThanOrEqual(10.2 + 1e-6);
    expect(r.hit!.point.z).toBeLessThanOrEqual(SLOT_Z_MIN + 1e-6);
  });

  it('selected depth NEAR: strikes the near door jamb', () => {
    const w = aimAtTarget(0.75);
    const r = w.command({ type: 'fire' })!;
    expect(r.hit?.id).toBe('jamb-c-near');
    expect(r.hit!.point.z).toBeGreaterThanOrEqual(SLOT_Z_MAX - 1e-6);
  });

  it('a slight depth error passes the slot yet misses the target in depth despite on-screen overlap', () => {
    const w = aimAtTarget(0.5);
    const r = w.command({ type: 'fire' })!;
    expect(r.hit?.id).not.toBe('enemy-c');
    expect(r.hit?.kind).not.toBe('actor');
    // The ray crossed the partition plane inside the slot...
    const tWall = (10 - r.origin.x) / r.direction.x;
    const zAtWall = r.origin.z + r.direction.z * tWall;
    expect(zAtWall).toBeGreaterThan(SLOT_Z_MIN);
    expect(zAtWall).toBeLessThan(SLOT_Z_MAX);
    // ...and passed the target's x with |z| beyond its half-depth.
    const tTarget = (13.6 - r.origin.x) / r.direction.x;
    expect(Math.abs(r.origin.z + r.direction.z * tTarget)).toBeGreaterThan(0.25);
  });

  it('sway sampled at the shot moment sets the depth offset; it is recorded', () => {
    const w = makeWorld('depth-shot', { baseSwayAmplitude: 1.2, swayFrequencyHz: 0.25 });
    hold(w, { pointerWorld: { x: 13.6, y: 1.2 } });
    ticks(w, 60); // quarter cycle: sin near 1 → offset near amplitude
    const r = w.command({ type: 'fire' })!;
    expect(w.aim.lastSampledOffset).not.toBeNull();
    expect(Math.abs(w.aim.lastSampledOffset!)).toBeGreaterThan(0.3);
    expect(r.aimPoint.z).toBeCloseTo(w.aim.lastSampledOffset!, 6);
    // With |offset| > 0.3 the target (half-depth 0.25) cannot be hit: either a jamb or a depth miss.
    expect(r.hit?.id).not.toBe('enemy-c');
  });

  it('foreground cover wins over a target behind it (observe state at station A)', () => {
    const w = makeWorld('exposure-ladder', { baseSwayAmplitude: 0 });
    hold(w, { observe: true, pointerWorld: { x: -6.2, y: 1.2 } });
    ticks(w, 5);
    const r = w.command({ type: 'fire' })!;
    expect(r.hit?.id).toBe('barrier-a');
    expect(r.hit!.t).toBeLessThan(1);
  });

  it('depth movement changes the real sightline: going FAR hides a MID target behind the far jamb', () => {
    const w = makeWorld('depth-shot');
    ticks(w, 5);
    expect(w.knowledge.observations.get('enemy-c')?.observed).toBe(true);
    w.command({ type: 'setDepthLane', lane: 'FAR' }); // W: glide to the zone's far edge
    ticks(w, 60);
    expect(w.player.position.z).toBeLessThan(-1.1);
    expect(w.knowledge.observations.get('enemy-c')?.observed).toBe(false);
    expect(w.sampleResultsFor('enemy-c').every((s) => s.blockedBy === 'jamb-c-far')).toBe(true);
  });

  it('a NEAR target becomes visible only after going FAR so the line crosses the slot', () => {
    const w = makeWorld('depth-shot');
    w.command({ type: 'setActorDepth', id: 'enemy-c', z: 0.7 });
    ticks(w, 5);
    expect(w.knowledge.observations.get('enemy-c')?.observed).toBe(false);
    w.command({ type: 'setDepthLane', lane: 'FAR' });
    ticks(w, 50);
    hold(w, {});
    ticks(w, 5);
    expect(w.player.position.z).toBeLessThan(-0.4);
    expect(w.knowledge.observations.get('enemy-c')?.observed).toBe(true);
  });
});
