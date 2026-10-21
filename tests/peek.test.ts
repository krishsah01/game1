import { describe, expect, it } from 'vitest';
import { SLOT_Z_MIN } from '../src/shared/scenarios.ts';
import { LOW_READY_PITCH } from '../src/shared/tuning.ts';
import type { World } from '../src/simulation/world.ts';
import { hold, makeWorld, observed, seconds, ticks } from './helpers.ts';

/**
 * Station C, depth cover. The player walks up to the slot partition, steps
 * FAR (z -1.2) behind the far jamb and holds F to peek around its edge
 * toward the 0.7 m slot. OPFOR C stands beyond the slot on the lane.
 */
function behindFarJamb(stance: 'STANDING' | 'CROUCHED' | 'PRONE' = 'STANDING'): World {
  const w = makeWorld('depth-shot', { baseSwayAmplitude: 0 });
  hold(w, { moveX: 1 });
  seconds(w, 1.2);
  hold(w, {});
  w.command({ type: 'setDepthLane', lane: 'FAR' });
  seconds(w, 1);
  // Off the lane, travel is confined to the zone: this stops 0.4 m short of the jamb.
  hold(w, { moveX: 1 });
  seconds(w, 1);
  hold(w, {});
  if (stance !== 'STANDING') w.command({ type: 'setStance', stance });
  ticks(w, 10);
  return w;
}

describe('peek from depth cover (station C)', () => {
  it('off the lane behind the far jamb: depth cover, eye blocked, target unseen', () => {
    const w = behindFarJamb();
    const p = w.player;
    expect(p.position.z).toBeCloseTo(-1.2, 2);
    expect(p.cover.depthCover?.id).toBe('jamb-c-far');
    expect(p.cover.state).toBe('none');
    expect(p.cover.peekLean).toBe(0);
    expect(observed(w, 'enemy-c')).toBe(false);
    expect(w.sampleResultsFor('enemy-c').every((s) => s.blockedBy === 'jamb-c-far')).toBe(true);
    expect(p.exposure.every((e) => !e.exposed)).toBe(true);
  });

  it('hold F: the eye leans past the jamb edge, the target is observed, the muzzle stays behind the jamb', () => {
    const w = behindFarJamb();
    hold(w, { observe: true });
    ticks(w, 10);
    const p = w.player;
    expect(p.cover.state).toBe('peek');
    expect(p.cover.eye.z).toBeGreaterThan(SLOT_Z_MIN);
    expect(p.cover.peekLean).toBeGreaterThan(0);
    expect(p.position.z).toBeCloseTo(-1.2, 2); // the body never moves
    expect(p.cover.muzzle.z).toBeCloseTo(-1.2, 2);
    expect(p.cover.aimPitch).toBeCloseTo((LOW_READY_PITCH.STANDING * Math.PI) / 180, 6); // rifle at low ready
    expect(observed(w, 'enemy-c')).toBe(true);
    // Sight begins at the eye, fire at the muzzle: the firing line still ends on the jamb.
    const r = w.command({ type: 'testFiringLine' });
    expect(r?.hit?.id).toBe('jamb-c-far');
    // Peeking exposes the head (and only the head) to the target.
    const exposed = p.exposure.filter((e) => e.exposed).map((e) => e.name);
    expect(exposed).toEqual(['head']);
  });

  it('releasing F returns the eye behind cover and the target is lost', () => {
    const w = behindFarJamb();
    hold(w, { observe: true });
    ticks(w, 10);
    hold(w, {});
    ticks(w, 10);
    expect(w.player.cover.state).toBe('none');
    expect(w.player.cover.eye.z).toBeCloseTo(-1.2, 2);
    expect(observed(w, 'enemy-c')).toBe(false);
  });

  it('works crouched, not prone', () => {
    const crouched = behindFarJamb('CROUCHED');
    hold(crouched, { observe: true });
    ticks(crouched, 10);
    expect(crouched.player.cover.state).toBe('peek');
    expect(observed(crouched, 'enemy-c')).toBe(true);

    const prone = behindFarJamb('PRONE');
    hold(prone, { observe: true });
    ticks(prone, 10);
    expect(prone.player.cover.depthCover).toBeNull();
    expect(prone.player.cover.state).toBe('none');
  });

  it('aiming or moving cancels the peek', () => {
    const w = behindFarJamb();
    hold(w, { observe: true, aim: true, pointerWorld: { x: 13.6, y: 1.4 } });
    ticks(w, 5);
    expect(w.player.cover.state).toBe('none');
    expect(w.player.cover.peekLean).toBe(0);
    hold(w, { observe: true, moveX: -1 });
    ticks(w, 5);
    expect(w.player.cover.state).not.toBe('peek');
  });

  it('on the lane there is no depth cover, so F does nothing at the jamb', () => {
    const w = makeWorld('depth-shot');
    hold(w, { moveX: 1, observe: true });
    seconds(w, 2);
    hold(w, { observe: true });
    ticks(w, 10);
    expect(w.player.cover.depthCover).toBeNull();
    expect(w.player.cover.state).toBe('none');
  });

  it('observe over waist-high cover is unchanged', () => {
    const w = makeWorld('exposure-ladder');
    hold(w, { observe: true });
    ticks(w, 10);
    expect(w.player.cover.state).toBe('observe');
    expect(w.player.cover.peekLean).toBe(0);
  });
});
