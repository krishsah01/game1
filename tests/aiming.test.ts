import { describe, expect, it } from 'vitest';
import { currentDepthOffset } from '../src/simulation/aiming.ts';
import { hold, makeWorld, seconds, ticks } from './helpers.ts';

describe('depth sway', () => {
  it('is deterministic: identical histories give identical phase and offset, and firing does not reroll it', () => {
    const a = makeWorld('depth-shot');
    const b = makeWorld('depth-shot');
    seconds(a, 2);
    seconds(b, 2);
    expect(a.aim.swayPhase).toBeCloseTo(b.aim.swayPhase, 10);
    expect(currentDepthOffset(a.aim)).toBeCloseTo(currentDepthOffset(b.aim), 10);
    hold(a, { pointerWorld: { x: 13.6, y: 1.2 }, aim: true });
    hold(b, { pointerWorld: { x: 13.6, y: 1.2 }, aim: true });
    a.step();
    b.step();
    a.command({ type: 'fire' });
    a.command({ type: 'fire' });
    expect(a.aim.swayPhase).toBeCloseTo(b.aim.swayPhase, 10);
    expect(a.aim.heat).toBeGreaterThan(0);
  });

  it('phase advances continuously with simulation time only', () => {
    const w = makeWorld('depth-shot');
    const p0 = w.aim.swayPhase;
    ticks(w, 60);
    const p1 = w.aim.swayPhase;
    expect(p1 - p0).toBeCloseTo(2 * Math.PI * w.config.swayFrequencyHz, 2);
    w.command({ type: 'pause' });
    ticks(w, 60);
    expect(w.aim.swayPhase).toBeCloseTo(p1, 10);
  });

  it('bracing, crouching and aiming reduce amplitude; movement and recoil raise it', () => {
    const still = makeWorld('depth-shot');
    seconds(still, 3);
    const stillAmp = still.aim.swayAmplitude;

    const walking = makeWorld('depth-shot');
    hold(walking, { moveX: 1 });
    seconds(walking, 2);
    expect(walking.player.moving).toBe(true);
    expect(walking.aim.swayAmplitude).toBeGreaterThan(stillAmp * 1.5);

    const sprinting = makeWorld('depth-shot');
    sprinting.command({ type: 'setMoveMode', mode: 'SPRINT' });
    hold(sprinting, { moveX: 1 });
    seconds(sprinting, 2);
    expect(sprinting.player.moving).toBe(true);
    expect(sprinting.aim.swayAmplitude).toBeGreaterThan(walking.aim.swayAmplitude);

    const crouched = makeWorld('depth-shot');
    crouched.command({ type: 'setStance', stance: 'CROUCHED' });
    seconds(crouched, 3);
    expect(crouched.aim.swayAmplitude).toBeLessThan(stillAmp);

    const aiming = makeWorld('depth-shot');
    hold(aiming, { aim: true });
    seconds(aiming, 3);
    expect(aiming.aim.swayAmplitude).toBeLessThan(stillAmp);

    const braced = makeWorld('depth-shot');
    braced.command({ type: 'teleportPlayer', x: 9.2, z: 0, facingX: 1 }); // doorframe within reach
    ticks(braced, 2);
    braced.command({ type: 'setBrace', on: true });
    expect(braced.player.braced).toBe(true);
    seconds(braced, 3);
    expect(braced.aim.swayAmplitude).toBeLessThan(aiming.aim.swayAmplitude);

    const recoil = makeWorld('depth-shot');
    seconds(recoil, 3);
    hold(recoil, { pointerWorld: { x: 13.6, y: 1.2 }, aim: true });
    recoil.step();
    for (let i = 0; i < 5; i++) recoil.command({ type: 'fire' });
    ticks(recoil, 6);
    expect(recoil.aim.swayAmplitude).toBeGreaterThan(stillAmp);
  });

  it('stopping produces a settling period instead of instant precision', () => {
    const w = makeWorld('depth-shot');
    hold(w, { moveX: 1 });
    seconds(w, 1.5);
    expect(w.player.moving).toBe(true);
    const moving = w.aim.swayAmplitude;
    hold(w, {});
    ticks(w, 6);
    const justStopped = w.aim.swayAmplitude;
    seconds(w, 3);
    const settled = w.aim.swayAmplitude;
    expect(justStopped).toBeGreaterThan(settled * 1.3);
    expect(justStopped).toBeLessThanOrEqual(moving + 1e-6);
    expect(w.aim.situation).toBe('STILL');
  });

  it('sprint cancels brace and aim', () => {
    const w = makeWorld('depth-shot');
    w.command({ type: 'teleportPlayer', x: 9.2, z: 0, facingX: 1 });
    ticks(w, 2);
    w.command({ type: 'setBrace', on: true });
    expect(w.player.braced).toBe(true);
    w.command({ type: 'setMoveMode', mode: 'SPRINT' });
    hold(w, { moveX: -1, aim: true });
    ticks(w, 3);
    expect(w.player.braced).toBe(false);
    expect(w.player.cover.aiming).toBe(false);
  });
});
