import { describe, expect, it } from 'vitest';
import { CAMERA } from '../src/shared/tuning.ts';
import type { World } from '../src/simulation/world.ts';
import { hold, makeWorld, observed, ticks } from './helpers.ts';

/**
 * Camera-war preset: crouched behind barrier-a, CAM 02 deployed on the wall
 * top looking at OPFOR A, link live. Sway zeroed so aim alone decides shots.
 */
function withWallCamera(): World {
  const w = makeWorld('camera-war', { baseSwayAmplitude: 0, cameraStatus: 'ONLINE' });
  w.command({ type: 'teleportPlayer', x: -11.5, z: 0, facingX: 1 });
  w.command({ type: 'setStance', stance: 'CROUCHED' });
  w.command({ type: 'equip', slot: 'CAMERA' });
  w.command({ type: 'deployCamera', at: { x: -10, y: 1.5 } });
  w.command({ type: 'equip', slot: 'PRIMARY' });
  ticks(w, 10);
  return w;
}

const enemyChest = { x: -6.2, y: 1.2 };

describe('v0.2.6 operator mode: switching to a camera perspective', () => {
  it('needs a live link; O takes the feed of a live friendly camera', () => {
    const off = makeWorld('camera-intel');
    off.command({ type: 'operateCamera' });
    expect(off.player.operating).toBeNull();
    expect(off.snapshot('player').message).toMatch(/LINK OFFLINE/);

    const on = makeWorld('camera-intel', { cameraStatus: 'ONLINE' });
    on.command({ type: 'operateCamera' });
    expect(on.player.operating).toBe('cam-01');
    expect(on.snapshot('player').operating).toMatchObject({ id: 'cam-01', gunAmmo: CAMERA.gunMagazine });
    on.command({ type: 'operateCamera' }); // only one live camera: back to the body
    expect(on.player.operating).toBeNull();
  });

  it('cycles through live cameras and back to the body', () => {
    const w = withWallCamera();
    w.command({ type: 'operateCamera' });
    expect(w.player.operating).toBe('cam-01');
    w.command({ type: 'operateCamera' });
    expect(w.player.operating).toBe('cam-d1');
    w.command({ type: 'operateCamera' });
    expect(w.player.operating).toBeNull();
  });

  it('the player view shows what the operated camera sees, not what the body sees', () => {
    const w = withWallCamera();
    w.command({ type: 'setStance', stance: 'STANDING' });
    ticks(w, 10);
    expect(observed(w, 'cam-op1')).toBe(true); // the standing body sees the OPFOR camera overhead
    w.command({ type: 'operateCamera', id: 'cam-d1' });
    const feed = w.snapshot('player');
    expect(feed.entities.map((e) => e.id)).toContain('enemy-a');
    expect(feed.entities.map((e) => e.id)).not.toContain('cam-op1'); // outside CAM 02's arc
  });
});

describe('v0.2.6 operator mode: the body is idle', () => {
  it('ignores movement and refuses every physical command while operating', () => {
    const w = withWallCamera();
    w.command({ type: 'operateCamera', id: 'cam-d1' });
    const x = w.player.position.x;
    hold(w, { moveX: 1 });
    ticks(w, 30);
    expect(w.player.position.x).toBe(x);
    for (const cmd of [{ type: 'toggleCrouch' }, { type: 'vault' }, { type: 'reload' }, { type: 'equip', slot: 'SIDEARM' }, { type: 'serviceCamera' }] as const) {
      const before = JSON.stringify({ stance: w.player.stance, equipped: w.player.equipped, vault: w.player.vault });
      w.command(cmd);
      expect(JSON.stringify({ stance: w.player.stance, equipped: w.player.equipped, vault: w.player.vault })).toBe(before);
      expect(w.snapshot('player').message).toMatch(/OPERATING CAM 02/);
    }
    // The body keeps its rifle at low ready even with the aim button held (that aims the camera gun).
    hold(w, { aim: true, pointerWorld: enemyChest });
    ticks(w, 3);
    expect(w.player.cover.aiming).toBe(false);
  });
});

describe('v0.2.6 operator mode: the camera gun', () => {
  it('fires from the lens with the same aiming rules, without the body in the line of fire', () => {
    const w = withWallCamera();
    w.command({ type: 'operateCamera', id: 'cam-d1' });
    hold(w, { pointerWorld: enemyChest });
    ticks(w, 3);
    expect(w.command({ type: 'fire' })).toBeNull(); // must aim first
    hold(w, { aim: true, pointerWorld: enemyChest });
    ticks(w, 3);
    const bodyAmmo = w.player.ammo;
    const r = w.command({ type: 'fire' })!;
    const cam = w.cameras.find((c) => c.seed.id === 'cam-d1')!;
    expect(r.origin).toEqual(cam.seed.position);
    expect(r.hit?.id).toBe('enemy-a');
    expect(cam.gunAmmo).toBe(CAMERA.gunMagazine - 1);
    expect(w.player.ammo).toBe(bodyAmmo);
  });

  it('refuses targets outside the camera arc', () => {
    const w = withWallCamera();
    w.command({ type: 'operateCamera', id: 'cam-d1' });
    hold(w, { aim: true, pointerWorld: { x: -14, y: 1.2 } }); // behind the camera
    ticks(w, 3);
    expect(w.command({ type: 'fire' })).toBeNull();
    expect(w.snapshot('player').message).toMatch(/OUTSIDE CAM 02 ARC/);
  });

  it('once empty, it can only be reloaded by the body at the camera (G)', () => {
    const w = withWallCamera();
    w.command({ type: 'operateCamera', id: 'cam-d1' });
    hold(w, { aim: true, pointerWorld: enemyChest });
    ticks(w, 3);
    for (let i = 0; i < CAMERA.gunMagazine; i++) w.command({ type: 'fire' });
    expect(w.command({ type: 'fire' })).toBeNull();
    expect(w.snapshot('player').message).toMatch(/GUN EMPTY/);
    w.command({ type: 'serviceCamera' }); // refused from the feed
    expect(w.cameras.find((c) => c.seed.id === 'cam-d1')!.gunAmmo).toBe(0);

    w.command({ type: 'operateCamera', id: null });
    hold(w, {});
    w.command({ type: 'teleportPlayer', x: -17, z: 0, facingX: 1 });
    ticks(w, 2);
    w.command({ type: 'serviceCamera' });
    expect(w.snapshot('player').message).toMatch(/NO CAMERA WITHIN REACH/);
    w.command({ type: 'teleportPlayer', x: -11.5, z: 0, facingX: 1 });
    ticks(w, 2);
    expect(w.snapshot('player').player.serviceable?.id).toBe('cam-d1');
    w.command({ type: 'serviceCamera' });
    expect(w.cameras.find((c) => c.seed.id === 'cam-d1')!.gunAmmo).toBe(CAMERA.gunMagazine);
  });

  it('the feed drops back to the body when the link goes down or the camera is destroyed', () => {
    const w = withWallCamera();
    w.command({ type: 'operateCamera', id: 'cam-d1' });
    w.applyConfig({ ...w.config, cameraStatus: 'JAMMED' });
    w.step();
    expect(w.player.operating).toBeNull();
    w.applyConfig({ ...w.config, cameraStatus: 'ONLINE' });
    w.command({ type: 'operateCamera', id: 'cam-d1' });
    w.cameras.find((c) => c.seed.id === 'cam-d1')!.destroyed = true;
    w.step();
    expect(w.player.operating).toBeNull();
  });
});
