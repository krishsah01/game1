import { describe, expect, it } from 'vitest';
import { BARRIER_TOP_Y, LOW_WALL_AB_TOP_Y, ROOM_DEPTH, buildScene, scenarioById } from '../src/shared/scenarios.ts';
import { ANCHORS, LOW_READY_PITCH, MOVE_SPEED, PRONE_SPEED_FACTOR, VAULT } from '../src/shared/tuning.ts';
import { bounds } from '../src/shared/types.ts';
import { World } from '../src/simulation/world.ts';
import { hold, makeWorld, observed, seconds, ticks } from './helpers.ts';

describe('prone (Z)', () => {
  it('Z toggles prone, C rises to a crouch; anchors and collider height follow the stance', () => {
    const w = makeWorld('hidden-battlefield');
    w.command({ type: 'toggleProne' });
    ticks(w, 2);
    expect(w.player.stance).toBe('PRONE');
    expect(w.player.cover.anchors.height).toBeCloseTo(ANCHORS.prone.height);
    expect(w.player.cover.eye.y).toBeCloseTo(ANCHORS.prone.eyeY);
    w.command({ type: 'toggleCrouch' });
    ticks(w, 2);
    expect(w.player.stance).toBe('CROUCHED');
    w.command({ type: 'toggleProne' });
    ticks(w, 2);
    expect(w.player.stance).toBe('PRONE');
    w.command({ type: 'toggleProne' });
    ticks(w, 2);
    expect(w.player.stance).toBe('STANDING');
    expect(w.player.cover.anchors.height).toBeCloseTo(ANCHORS.standing.height);
  });

  it('prone crawls at a fixed slow speed whatever tier is selected, and sways less than a crouch', () => {
    const w = makeWorld('hidden-battlefield');
    w.command({ type: 'setStance', stance: 'PRONE' });
    w.command({ type: 'setMoveMode', mode: 'SPRINT' });
    hold(w, { moveX: 1 });
    const x0 = w.player.position.x;
    seconds(w, 1);
    expect(w.player.position.x - x0).toBeCloseTo(MOVE_SPEED.WALK * PRONE_SPEED_FACTOR, 1);
    expect(w.player.braced).toBe(false);

    const prone = makeWorld('depth-shot');
    prone.command({ type: 'setStance', stance: 'PRONE' });
    seconds(prone, 3);
    const crouched = makeWorld('depth-shot');
    crouched.command({ type: 'setStance', stance: 'CROUCHED' });
    seconds(crouched, 3);
    expect(prone.aim.swayAmplitude).toBeLessThan(crouched.aim.swayAmplitude);
    expect(prone.aim.situation).toContain('PRONE');
  });

  it('prone behind the low wall: eye below the top, target unseen, muzzle pressed to the face, a shot strikes the wall', () => {
    const w = makeWorld('exposure-ladder', { baseSwayAmplitude: 0 });
    w.command({ type: 'setStance', stance: 'PRONE' });
    hold(w, { pointerWorld: { x: -6.2, y: 1.2 }, aim: true });
    ticks(w, 10);
    expect(w.player.cover.state).toBe('none');
    expect(w.player.cover.eye.y).toBeLessThan(BARRIER_TOP_Y);
    expect(observed(w, 'enemy-a')).toBe(false);
    // The rifle would reach into the wall (0.85 m forward from 0.45 m away): it is pulled back to the face.
    expect(w.player.cover.muzzleClamped).toBe(true);
    expect(w.player.cover.muzzle.x).toBeLessThan(-10.8);
    const r = w.command({ type: 'fire' })!;
    expect(r.hit?.id).toBe('barrier-a');
    expect(r.hit!.t).toBeLessThan(0.1);
  });

  it('crouched with the body against the wall: the hidden muzzle is clamped and the firing-line test ends on the wall', () => {
    const w = makeWorld('exposure-ladder');
    hold(w, { moveX: 1 });
    seconds(w, 2); // walks up to the face
    hold(w, {});
    ticks(w, 5);
    expect(w.player.lastBlockedBy ?? 'barrier-a').toBe('barrier-a');
    expect(w.player.cover.state).toBe('hidden');
    expect(w.player.cover.muzzleClamped).toBe(true);
    expect(w.player.cover.muzzle.x).toBeLessThan(-10.8);
    const r = w.command({ type: 'testFiringLine' })!;
    expect(r.hit?.id).toBe('barrier-a');
  });
});

describe('vault (Space)', () => {
  it('both low walls are vaultable and span the entire depth axis', () => {
    const w = makeWorld('exposure-ladder');
    const a = w.scene.colliders.find((c) => c.id === 'barrier-a')!;
    const ab = w.scene.colliders.find((c) => c.id === 'barrier-ab')!;
    expect(a.isVaultable).toBe(true);
    expect(ab.isVaultable).toBe(true);
    expect(a.bounds.size.z).toBeCloseTo(ROOM_DEPTH);
    expect(ab.bounds.size.z).toBeCloseTo(ROOM_DEPTH);
    expect(a.bounds.center.y + a.bounds.size.y / 2).toBeCloseTo(BARRIER_TOP_Y);
    expect(ab.bounds.center.y + ab.bounds.size.y / 2).toBeCloseTo(LOW_WALL_AB_TOP_Y);
    expect(w.scene.colliders.filter((c) => c.isVaultable).map((c) => c.id).sort()).toEqual(['barrier-a', 'barrier-ab']);
  });

  it('vaults the wall from a standing start: head clears the top mid-way, no firing, lands beyond it', () => {
    const w = makeWorld('exposure-ladder');
    w.command({ type: 'setStance', stance: 'STANDING' });
    ticks(w, 2);
    w.command({ type: 'vault' });
    expect(w.player.vault?.obstacleId).toBe('barrier-a');
    ticks(w, Math.round((VAULT.duration * 60) / 2)); // apex
    expect(w.player.vault).not.toBeNull();
    expect(w.player.position.y).toBeGreaterThan(BARRIER_TOP_Y);
    expect(w.player.cover.eye.y).toBeGreaterThan(BARRIER_TOP_Y);
    expect(w.player.cover.anchors.height).toBeCloseTo(ANCHORS.vault.height);
    expect(observed(w, 'enemy-a')).toBe(true); // the exposed head reveals the target beyond the wall
    expect(w.command({ type: 'fire' })).toBeNull();
    expect(w.snapshot('player').message).toMatch(/VAULTING/);
    seconds(w, 0.6);
    expect(w.player.vault).toBeNull();
    expect(w.player.position.y).toBe(0);
    expect(w.player.position.x).toBeCloseTo(-9.2 + 0.25 + VAULT.clearance, 5);
    expect(w.player.stance).toBe('STANDING');
    expect(w.player.moving).toBe(false);
  });

  it('vaulting from a crouch keeps the crouch on landing', () => {
    const w = makeWorld('exposure-ladder');
    ticks(w, 2);
    expect(w.player.cover.state).toBe('hidden');
    w.command({ type: 'vault' });
    seconds(w, 1);
    expect(w.player.vault).toBeNull();
    expect(w.player.stance).toBe('CROUCHED');
    expect(w.player.position.x).toBeGreaterThan(-9.2);
    expect(w.player.cover.state).toBe('none'); // the wall is now behind the body
  });

  it('refuses when nothing vaultable is ahead, when prone, and when the landing spot is blocked', () => {
    const none = makeWorld('depth-shot');
    none.command({ type: 'teleportPlayer', x: 9.2, z: 0, facingX: 1 }); // door jambs are not vaultable
    ticks(none, 2);
    none.command({ type: 'vault' });
    expect(none.player.vault).toBeNull();
    expect(none.snapshot('player').message).toMatch(/NOTHING TO VAULT/);

    const prone = makeWorld('exposure-ladder');
    prone.command({ type: 'setStance', stance: 'PRONE' });
    ticks(prone, 2);
    prone.command({ type: 'vault' });
    expect(prone.player.vault).toBeNull();
    expect(prone.snapshot('player').message).toMatch(/STAND OR CROUCH/);

    // A crate right behind the low wall between A and B blocks the landing spot.
    const base = scenarioById('hidden-battlefield')!;
    const scene = buildScene(base.initialScene.entities);
    scene.colliders.push({
      id: 'crate-test',
      bounds: bounds(-2.3, 0.5, 0, 1.0, 1.0, 1.0),
      blocksMovement: true,
      blocksSight: true,
      blocksShots: true,
      visualRole: 'crate',
      isCover: false,
      isVaultable: false,
    });
    const w = new World({ ...base, initialScene: scene }, { config: base.defaultConfig, seed: base.seed });
    w.command({ type: 'teleportPlayer', x: -3.9, z: 0, facingX: 1 });
    ticks(w, 2);
    w.command({ type: 'vault' });
    expect(w.player.vault).toBeNull();
    expect(w.snapshot('player').message).toMatch(/LANDING BLOCKED/);
  });
});

describe('arms follow the aim point while aiming', () => {
  it('the muzzle swings around the rifle pivot with the pointer height, within the stance limits', () => {
    const aim = ANCHORS.standingAim;
    const level = makeWorld('depth-shot');
    hold(level, { pointerWorld: { x: 13.6, y: aim.pivotY }, aim: true });
    ticks(level, 2);
    expect(level.player.cover.aimPitch).toBeCloseTo(0, 2);
    expect(level.player.cover.muzzle.y).toBeCloseTo(aim.muzzleY, 2);

    const up = makeWorld('depth-shot');
    hold(up, { pointerWorld: { x: 8.5, y: 4.0 }, aim: true });
    ticks(up, 2);
    expect(up.player.cover.aimPitch).toBeGreaterThan(0.5);
    expect(up.player.cover.muzzle.y).toBeGreaterThan(aim.muzzleY + 0.3);
    const d = Math.hypot(up.player.cover.muzzle.x - up.player.cover.pivot.x, up.player.cover.muzzle.y - up.player.cover.pivot.y);
    expect(d).toBeCloseTo(Math.hypot(aim.muzzleForward, aim.muzzleY - aim.pivotY), 5);

    const down = makeWorld('depth-shot');
    hold(down, { pointerWorld: { x: 8.5, y: -1.0 }, aim: true });
    ticks(down, 2);
    expect(down.player.cover.aimPitch).toBeLessThan(-0.5);
    expect(down.player.cover.muzzle.y).toBeLessThan(aim.muzzleY - 0.3);

    const straightUp = makeWorld('depth-shot');
    hold(straightUp, { pointerWorld: { x: 6.5, y: 30 }, aim: true });
    ticks(straightUp, 2);
    expect(straightUp.player.cover.aimPitch).toBeCloseTo((70 * Math.PI) / 180, 3);

    const prone = makeWorld('depth-shot');
    prone.command({ type: 'setStance', stance: 'PRONE' });
    hold(prone, { pointerWorld: { x: 8.5, y: 4.0 }, aim: true });
    ticks(prone, 2);
    expect(prone.player.cover.aimPitch).toBeCloseTo((25 * Math.PI) / 180, 3);
  });

  it('the firing line starts where the barrel ends: an upward aim fires from the raised muzzle', () => {
    const w = makeWorld('depth-shot', { baseSwayAmplitude: 0 });
    hold(w, { pointerWorld: { x: 8.5, y: 3.0 }, aim: true });
    ticks(w, 2);
    const r = w.command({ type: 'fire' })!;
    expect(r.origin.y).toBeCloseTo(w.player.cover.muzzle.y, 6);
    expect(r.origin.y).toBeGreaterThan(ANCHORS.standingAim.muzzleY + 0.2);
    expect(r.direction.y).toBeGreaterThan(0.3);
  });

  it('hidden and observe keep the rifle at low ready; aim-over pitches it', () => {
    const observe = makeWorld('exposure-ladder');
    hold(observe, { observe: true, pointerWorld: { x: -6.2, y: 4.0 } });
    ticks(observe, 10);
    expect(observe.player.cover.state).toBe('observe');
    expect(observe.player.cover.aimPitch).toBeCloseTo((LOW_READY_PITCH.CROUCHED * Math.PI) / 180, 6);
    expect(observe.player.cover.muzzle.y).toBeLessThan(BARRIER_TOP_Y);

    const aimOver = makeWorld('exposure-ladder');
    hold(aimOver, { aim: true, pointerWorld: { x: -6.2, y: 3.0 } });
    ticks(aimOver, 10);
    expect(aimOver.player.cover.state).toBe('aimOver');
    expect(aimOver.player.cover.aimPitch).toBeGreaterThan(0.2);
    expect(aimOver.player.cover.muzzle.y).toBeGreaterThan(BARRIER_TOP_Y);
  });
});
