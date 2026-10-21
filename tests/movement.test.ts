import { describe, expect, it } from 'vitest';
import { BODY_WIDTH } from '../src/shared/tuning.ts';
import { hold, makeWorld, seconds, ticks } from './helpers.ts';

/**
 * Depth is on/off: `setDepthLane FAR` (W) glides the body to the far edge of
 * the depth zone it stands in, `setDepthLane LANE` (S) glides it back to z = 0.
 * There is no held depth axis and no NEAR position.
 */
describe('collision-aware movement and on/off depth', () => {
  it('cannot walk through the low wall', () => {
    const w = makeWorld('exposure-ladder');
    w.command({ type: 'setStance', stance: 'STANDING' });
    hold(w, { moveX: 1 });
    seconds(w, 3);
    expect(w.player.position.x).toBeLessThan(-10.8 - BODY_WIDTH / 2 + 0.01);
    expect(w.player.lastBlockedBy).toBe('barrier-a');
  });

  it('W is refused outside a depth zone and leaves the body on the lane', () => {
    const w = makeWorld('exposure-ladder');
    w.command({ type: 'setDepthLane', lane: 'FAR' });
    seconds(w, 1);
    expect(w.player.position.z).toBeCloseTo(0);
    expect(w.player.zone).toBeNull();
    expect(w.player.depthLane).toBe('LANE');
    expect(w.player.depthTargetZ).toBeNull();
    expect(w.snapshot('player').message).toMatch(/NO DEPTH ZONE/);
  });

  it('inside a zone W glides to the far edge and S glides back; the body never travels toward the camera', () => {
    const w = makeWorld('depth-shot');
    expect(w.player.zone?.id).toBe('zone-c');
    w.command({ type: 'setDepthLane', lane: 'FAR' });
    ticks(w, 3);
    expect(w.player.depthTargetZ).toBeCloseTo(-1.2);
    expect(w.player.position.z).toBeLessThan(0);
    expect(w.player.position.z).toBeGreaterThan(-1.2); // mid-glide
    expect(w.player.moving).toBe(true);
    seconds(w, 1);
    expect(w.player.position.z).toBeCloseTo(-1.2, 5);
    expect(w.player.depthTargetZ).toBeNull();
    expect(w.player.depthLane).toBe('FAR');
    expect(w.player.moving).toBe(false);
    w.command({ type: 'setDepthLane', lane: 'LANE' });
    seconds(w, 1);
    expect(w.player.position.z).toBeCloseTo(0, 5);
    expect(w.player.depthLane).toBe('LANE');
    // S on the lane is a no-op: nothing ever moves to +Z.
    w.command({ type: 'setDepthLane', lane: 'LANE' });
    seconds(w, 0.5);
    expect(w.player.position.z).toBeCloseTo(0, 5);
    for (let i = 0; i < 30; i++) {
      w.step();
      expect(w.player.position.z).toBeLessThanOrEqual(1e-6);
    }
  });

  it('while FAR, horizontal travel stays inside the zone', () => {
    const w = makeWorld('depth-shot');
    w.command({ type: 'setDepthLane', lane: 'FAR' });
    seconds(w, 1);
    hold(w, { moveX: -1 });
    seconds(w, 5);
    expect(w.player.position.x).toBeGreaterThanOrEqual(5.0 + BODY_WIDTH / 2 - 0.01);
  });

  it('the slot lets the lane through but blocks a FAR body', () => {
    const onLane = makeWorld('depth-shot');
    onLane.command({ type: 'setMoveMode', mode: 'SPRINT' });
    hold(onLane, { moveX: 1 });
    seconds(onLane, 2);
    expect(onLane.player.position.x).toBeGreaterThan(10.5);

    const far = makeWorld('depth-shot');
    far.command({ type: 'setDepthLane', lane: 'FAR' });
    seconds(far, 1);
    far.command({ type: 'setMoveMode', mode: 'SPRINT' });
    hold(far, { moveX: 1 });
    seconds(far, 2);
    expect(far.player.position.x).toBeLessThan(9.8);
  });

  it('the station-B doorway is reachable only by going FAR through the doorway lane', () => {
    const w = makeWorld('hidden-battlefield');
    w.command({ type: 'setMoveMode', mode: 'SPRINT' });
    hold(w, { moveX: 1 });
    seconds(w, 2);
    expect(w.player.position.x).toBeLessThan(0.8); // partition face
    expect(w.player.lastBlockedBy).toBe('partition-b');
    hold(w, {});
    w.command({ type: 'setDepthLane', lane: 'FAR' });
    seconds(w, 1.5);
    expect(w.player.position.z).toBeCloseTo(-2.6, 1);
    hold(w, { moveX: 1 });
    seconds(w, 2);
    expect(w.player.position.x).toBeGreaterThan(1.3);
  });

  it('a depth move whose path is blocked is refused up front, so the body is never stranded between lanes', () => {
    const w = makeWorld('control-point');
    w.command({ type: 'teleportPlayer', x: 17.0, z: 0, facingX: 1 }); // zone-d, crate-d-shield behind
    ticks(w, 2);
    expect(w.player.zone?.id).toBe('zone-d');
    w.command({ type: 'setDepthLane', lane: 'FAR' });
    seconds(w, 1);
    expect(w.player.position.z).toBeCloseTo(0, 5);
    expect(w.player.depthTargetZ).toBeNull();
    expect(w.player.depthLane).toBe('LANE');
    expect(w.snapshot('player').message).toMatch(/DEPTH PATH BLOCKED/);
  });

  it('focus loss clears held input so the body stops', () => {
    const w = makeWorld('hidden-battlefield');
    hold(w, { moveX: 1 });
    ticks(w, 10);
    const x = w.player.position.x;
    w.clearHeld();
    ticks(w, 10);
    expect(w.player.position.x).toBeCloseTo(x);
    expect(w.player.moving).toBe(false);
  });
});
