import { describe, expect, it } from 'vitest';
import { BARRIER_TOP_Y } from '../src/shared/scenarios.ts';
import { ANCHORS, LOW_READY_PITCH, MAGAZINE_SIZE } from '../src/shared/tuning.ts';
import type { World } from '../src/simulation/world.ts';
import { hold, makeWorld, observed, seconds, ticks } from './helpers.ts';

const deg = (d: number) => (d * Math.PI) / 180;

/** Crouched behind barrier-a in the exposure-ladder preset, OPFOR A beyond it. */
function atBarrier(patch: Parameters<typeof hold>[1]): World {
  const w = makeWorld('exposure-ladder', { baseSwayAmplitude: 0 });
  hold(w, patch);
  ticks(w, 10);
  return w;
}

describe('v0.2.3 aiming: low ready unless the aim button is held', () => {
  it('without aim the rifle rests muzzle-down at low ready whatever the pointer does', () => {
    for (const y of [-1, 1.2, 4]) {
      const w = makeWorld('depth-shot');
      hold(w, { pointerWorld: { x: 13.6, y } });
      ticks(w, 2);
      expect(w.player.cover.aiming).toBe(false);
      expect(w.player.cover.aimPitch).toBeCloseTo(deg(LOW_READY_PITCH.STANDING), 6);
      expect(w.player.cover.muzzle.y).toBeLessThan(w.player.cover.pivot.y - 0.3);
    }
    const crouched = makeWorld('depth-shot');
    crouched.command({ type: 'setStance', stance: 'CROUCHED' });
    ticks(crouched, 2);
    expect(crouched.player.cover.aimPitch).toBeCloseTo(deg(LOW_READY_PITCH.CROUCHED), 6);
    expect(crouched.player.cover.muzzle.y).toBeGreaterThan(0); // never into the floor
  });

  it('holding aim points the rifle at the pointer', () => {
    const w = makeWorld('depth-shot');
    hold(w, { pointerWorld: { x: 13.6, y: ANCHORS.standingAim.pivotY }, aim: true });
    ticks(w, 2);
    expect(w.player.cover.aiming).toBe(true);
    expect(w.player.cover.aimPitch).toBeCloseTo(0, 2);
    hold(w, { pointerWorld: { x: 8.5, y: 4 }, aim: true });
    ticks(w, 2);
    expect(w.player.cover.aimPitch).toBeGreaterThan(0.5);
  });

  it('cannot shoot without aiming: the shot is refused and costs no ammo', () => {
    const w = makeWorld('depth-shot', { baseSwayAmplitude: 0 });
    hold(w, { pointerWorld: { x: 13.6, y: 1.2 } });
    ticks(w, 2);
    expect(w.command({ type: 'fire' })).toBeNull();
    expect(w.player.ammo).toBe(MAGAZINE_SIZE);
    expect(w.tracers).toHaveLength(0);
    expect(w.snapshot('player').message).toMatch(/LOW READY/);
    hold(w, { pointerWorld: { x: 13.6, y: 1.2 }, aim: true });
    ticks(w, 2);
    expect(w.command({ type: 'fire' })?.hit?.id).toBe('enemy-c');
    expect(w.player.ammo).toBe(MAGAZINE_SIZE - 1);
  });

  it('sprinting cannot aim, so it cannot fire', () => {
    const w = makeWorld('depth-shot');
    w.command({ type: 'setMoveMode', mode: 'SPRINT' });
    hold(w, { moveX: -1, aim: true, pointerWorld: { x: 13.6, y: 1.2 } });
    seconds(w, 0.3);
    expect(w.player.cover.aiming).toBe(false);
    expect(w.command({ type: 'fire' })).toBeNull();
  });

  it('the inspector aim latch counts as holding aim', () => {
    const w = makeWorld('depth-shot', { baseSwayAmplitude: 0 });
    hold(w, { pointerWorld: { x: 13.6, y: 1.2 } });
    w.command({ type: 'setAimLatch', on: true });
    ticks(w, 2);
    expect(w.player.cover.aiming).toBe(true);
    expect(w.command({ type: 'fire' })?.hit?.id).toBe('enemy-c');
  });
});

describe('v0.2.3 aiming: observe, then aim to raise the rifle over cover', () => {
  it('observe: eyes over the top, rifle at low ready below it, no shooting', () => {
    const w = atBarrier({ observe: true, pointerWorld: { x: -6.2, y: 1.2 } });
    expect(w.player.cover.state).toBe('observe');
    expect(observed(w, 'enemy-a')).toBe(true);
    expect(w.player.cover.muzzle.y).toBeLessThan(BARRIER_TOP_Y);
    expect(w.command({ type: 'fire' })).toBeNull();
  });

  it('observe + aim raises the rifle: a little more exposure, and the shot reaches the target', () => {
    const observe = atBarrier({ observe: true, pointerWorld: { x: -6.2, y: 1.2 } });
    const raised = atBarrier({ observe: true, aim: true, pointerWorld: { x: -6.2, y: 1.2 } });
    expect(raised.player.cover.state).toBe('aimOver');
    // Raising the rifle lifts the body: taller collider and a higher eye than observe.
    expect(raised.player.cover.anchors.height).toBeGreaterThan(observe.player.cover.anchors.height);
    expect(raised.player.cover.eye.y).toBeGreaterThan(observe.player.cover.eye.y);
    const exposedCount = (w: World) => w.player.exposure.filter((e) => e.exposed).length;
    expect(exposedCount(raised)).toBeGreaterThan(exposedCount(observe));
    expect(raised.player.cover.muzzle.y).toBeGreaterThan(BARRIER_TOP_Y);
    expect(raised.command({ type: 'fire' })?.hit?.id).toBe('enemy-a');
  });

  it('releasing aim drops back to observe at low ready', () => {
    const w = atBarrier({ observe: true, aim: true, pointerWorld: { x: -6.2, y: 1.2 } });
    expect(w.player.cover.state).toBe('aimOver');
    hold(w, { observe: true, pointerWorld: { x: -6.2, y: 1.2 } });
    ticks(w, 2);
    expect(w.player.cover.state).toBe('observe');
    expect(w.player.cover.aimPitch).toBeCloseTo(deg(LOW_READY_PITCH.CROUCHED), 6);
  });
});
