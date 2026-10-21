import { describe, expect, it } from 'vitest';
import { BODY_WIDTH } from '../src/shared/tuning.ts';
import { hold, makeWorld, seconds, ticks } from './helpers.ts';

describe('collision-aware movement and contextual depth', () => {
  it('cannot walk through the barrier', () => {
    const w = makeWorld('exposure-ladder');
    w.command({ type: 'setStance', stance: 'STANDING' });
    hold(w, { moveX: 1 });
    seconds(w, 3);
    expect(w.player.position.x).toBeLessThan(-10.8 - BODY_WIDTH / 2 + 0.01);
    expect(w.player.lastBlockedBy).toBe('barrier-a');
  });

  it('depth input is ignored outside a depth zone', () => {
    const w = makeWorld('exposure-ladder');
    hold(w, { moveZ: 1 });
    seconds(w, 1);
    expect(w.player.position.z).toBeCloseTo(0);
    expect(w.player.zone).toBeNull();
  });

  it('inside a zone depth travel works and is clamped to the zone', () => {
    const w = makeWorld('depth-shot');
    expect(w.player.zone?.id).toBe('zone-c');
    hold(w, { moveZ: 1 });
    seconds(w, 3);
    expect(w.player.position.z).toBeCloseTo(-1.2, 1);
    hold(w, { moveZ: -1 });
    seconds(w, 4);
    expect(w.player.position.z).toBeCloseTo(1.2, 1);
  });

  it('while off the lane, horizontal travel stays inside the zone', () => {
    const w = makeWorld('depth-shot');
    hold(w, { moveZ: -1 });
    seconds(w, 1);
    hold(w, { moveX: -1 });
    seconds(w, 5);
    expect(w.player.position.x).toBeGreaterThanOrEqual(5.0 + BODY_WIDTH / 2 - 0.01);
  });

  it('the slot lets the lane through but blocks an off-lane body', () => {
    const onLane = makeWorld('depth-shot');
    onLane.command({ type: 'setMoveMode', mode: 'SPRINT' });
    hold(onLane, { moveX: 1 });
    seconds(onLane, 2);
    expect(onLane.player.position.x).toBeGreaterThan(10.5);

    const offLane = makeWorld('depth-shot');
    hold(offLane, { moveZ: -1 });
    seconds(offLane, 1);
    offLane.command({ type: 'setMoveMode', mode: 'SPRINT' });
    hold(offLane, { moveX: 1 });
    seconds(offLane, 2);
    expect(offLane.player.position.x).toBeLessThan(9.8);
  });

  it('the station-B doorway is reachable only by stepping FAR through the lane', () => {
    const w = makeWorld('hidden-battlefield');
    w.command({ type: 'setMoveMode', mode: 'SPRINT' });
    hold(w, { moveX: 1 });
    seconds(w, 2);
    expect(w.player.position.x).toBeLessThan(0.8); // partition face
    expect(w.player.lastBlockedBy).toBe('partition-b');
    hold(w, { moveZ: 1 });
    seconds(w, 3);
    expect(w.player.position.z).toBeCloseTo(-2.6, 1);
    hold(w, { moveX: 1 });
    seconds(w, 2);
    expect(w.player.position.x).toBeGreaterThan(1.3);
  });

  it('focus loss clears held input so the body stops', () => {
    const w = makeWorld('hidden-battlefield');
    hold(w, { moveX: -1 });
    ticks(w, 10);
    const x = w.player.position.x;
    w.clearHeld();
    ticks(w, 10);
    expect(w.player.position.x).toBeCloseTo(x);
    expect(w.player.moving).toBe(false);
  });
});
