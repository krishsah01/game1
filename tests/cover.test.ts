import { describe, expect, it } from 'vitest';
import { BARRIER_TOP_Y } from '../src/shared/scenarios.ts';
import { hold, makeWorld, observed, sources, ticks } from './helpers.ts';

/**
 * Station A, exposure ladder. The crouched player stands 0.45 m from a
 * 1.10 m barrier with a standing target 3.8 m beyond it.
 */
describe('cover states (station A)', () => {
  it('hidden: eye and muzzle below the barrier top, target not observed', () => {
    const w = makeWorld('exposure-ladder');
    ticks(w, 10);
    const p = w.player;
    expect(p.cover.state).toBe('hidden');
    expect(p.cover.nearCover?.id).toBe('barrier-a');
    expect(p.cover.eye.y).toBeLessThan(BARRIER_TOP_Y);
    expect(p.cover.muzzle.y).toBeLessThan(BARRIER_TOP_Y);
    expect(observed(w, 'enemy-a')).toBe(false);
    const samples = w.sampleResultsFor('enemy-a');
    expect(samples.every((s) => s.reason === 'blocked' && s.blockedBy === 'barrier-a')).toBe(true);
  });

  it('observe: eye clears the top, target observed, muzzle still below and firing line hits the barrier', () => {
    const w = makeWorld('exposure-ladder');
    hold(w, { observe: true });
    ticks(w, 10);
    const p = w.player;
    expect(p.cover.state).toBe('observe');
    expect(p.cover.eye.y).toBeGreaterThan(BARRIER_TOP_Y);
    expect(p.cover.muzzle.y).toBeLessThan(BARRIER_TOP_Y);
    expect(observed(w, 'enemy-a')).toBe(true);
    expect(sources(w, 'enemy-a')).toEqual(['player']);
    const samples = w.sampleResultsFor('enemy-a');
    expect(samples.find((s) => s.name === 'head')?.reason).toBe('clear');
    const line = w.previewShot();
    expect(line.hit?.id).toBe('barrier-a');
    // Test firing line button: strikes the barrier, no target hit, no ammo used.
    const before = w.player.ammo;
    const r = w.command({ type: 'testFiringLine' });
    expect(r?.hit?.id).toBe('barrier-a');
    expect(w.player.ammo).toBe(before);
    expect(w.lastFiringLineTest?.result.hit?.id).toBe('barrier-a');
  });

  it('aim over: both anchors clear and the shot reaches the target', () => {
    const w = makeWorld('exposure-ladder', { baseSwayAmplitude: 0 });
    hold(w, { aim: true, pointerWorld: { x: -6.2, y: 1.2 } });
    ticks(w, 10);
    const p = w.player;
    expect(p.cover.state).toBe('aimOver');
    expect(p.cover.eye.y).toBeGreaterThan(BARRIER_TOP_Y);
    expect(p.cover.muzzle.y).toBeGreaterThan(BARRIER_TOP_Y);
    expect(observed(w, 'enemy-a')).toBe(true);
    const r = w.command({ type: 'fire' });
    expect(r?.hit?.kind).toBe('actor');
    expect(r?.hit?.id).toBe('enemy-a');
    expect(w.player.ammo).toBe(23);
  });

  it('blind fire is disabled while hidden', () => {
    const w = makeWorld('exposure-ladder');
    ticks(w, 5);
    expect(w.command({ type: 'fire' })).toBeNull();
    expect(w.player.ammo).toBe(24);
  });

  it('latched UI intents drive the same mechanical states and moving cancels them', () => {
    const w = makeWorld('exposure-ladder');
    w.command({ type: 'setCoverIntent', intent: 'observe' });
    ticks(w, 5);
    expect(w.player.cover.state).toBe('observe');
    w.command({ type: 'setCoverIntent', intent: 'aimOver' });
    ticks(w, 5);
    expect(w.player.cover.state).toBe('aimOver');
    hold(w, { moveX: -1 });
    ticks(w, 5);
    expect(w.player.coverIntent).toBeNull();
    expect(w.player.cover.state).not.toBe('aimOver');
  });

  it('standing next to the barrier exposes head and chest to the target', () => {
    const w = makeWorld('exposure-ladder');
    w.command({ type: 'setStance', stance: 'STANDING' });
    ticks(w, 10);
    expect(w.player.cover.state).toBe('none');
    const exposed = w.player.exposure.filter((e) => e.exposed).map((e) => e.name);
    expect(exposed).toContain('head');
    expect(exposed).toContain('chest');
    const hidden = makeWorld('exposure-ladder');
    ticks(hidden, 10);
    expect(hidden.player.exposure.every((e) => !e.exposed)).toBe(true);
  });
});
