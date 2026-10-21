import { describe, expect, it } from 'vitest';
import { ANCHORS } from '../src/shared/tuning.ts';
import { WEAPONS } from '../src/shared/weapons.ts';
import type { World } from '../src/simulation/world.ts';
import { hold, makeWorld, seconds, ticks } from './helpers.ts';

/** Depth-shot preset, standing on the lane, aiming level at OPFOR C through the slot. */
function aimingLevel(setup?: (w: World) => void): World {
  const w = makeWorld('depth-shot', { baseSwayAmplitude: 0 });
  setup?.(w);
  hold(w, { pointerWorld: { x: 13.6, y: ANCHORS.standingAim.pivotY }, aim: true });
  ticks(w, 3);
  return w;
}

describe('v0.2.5 weapons: primary and sidearm carried together', () => {
  it('starts with a carbine and a pistol, each with its own full magazine', () => {
    const w = makeWorld('depth-shot');
    expect(w.player.loadout).toEqual({ primary: 'CARBINE', sidearm: 'PISTOL' });
    expect(w.player.magazines).toEqual({ PRIMARY: WEAPONS.CARBINE.magazine, SIDEARM: WEAPONS.PISTOL.magazine });
    expect(w.player.equipped).toBe('PRIMARY');
    expect(w.player.ammo).toBe(WEAPONS.CARBINE.magazine);
  });

  it('switching slots keeps each magazine; firing spends only the weapon in hand', () => {
    const w = aimingLevel();
    w.command({ type: 'fire' });
    w.command({ type: 'fire' });
    expect(w.player.magazines.PRIMARY).toBe(WEAPONS.CARBINE.magazine - 2);
    w.command({ type: 'equip', slot: 'SIDEARM' });
    ticks(w, 2);
    expect(w.player.ammo).toBe(WEAPONS.PISTOL.magazine);
    expect(w.command({ type: 'fire' })?.hit?.id).toBe('enemy-c');
    expect(w.player.magazines).toEqual({ PRIMARY: WEAPONS.CARBINE.magazine - 2, SIDEARM: WEAPONS.PISTOL.magazine - 1 });
    w.command({ type: 'reload' });
    expect(w.player.magazines.SIDEARM).toBe(WEAPONS.PISTOL.magazine);
    expect(w.player.magazines.PRIMARY).toBe(WEAPONS.CARBINE.magazine - 2);
    w.command({ type: 'equip', slot: 'PRIMARY' });
    expect(w.player.ammo).toBe(WEAPONS.CARBINE.magazine - 2);
  });

  it('weapons are swapped per slot; a sidearm cannot go in the primary slot', () => {
    const w = makeWorld('depth-shot');
    w.command({ type: 'setLoadout', slot: 'PRIMARY', weapon: 'DMR' });
    expect(w.player.loadout.primary).toBe('DMR');
    expect(w.player.ammo).toBe(WEAPONS.DMR.magazine);
    w.command({ type: 'setLoadout', slot: 'PRIMARY', weapon: 'PISTOL' });
    expect(w.player.loadout.primary).toBe('DMR');
    expect(w.snapshot('player').message).toMatch(/NOT A PRIMARY/);
    w.command({ type: 'setLoadout', slot: 'SIDEARM', weapon: 'MACHINE_PISTOL' });
    expect(w.player.loadout.sidearm).toBe('MACHINE_PISTOL');
  });

  it('barrel length is mechanical: the muzzle reaches further with the DMR and less with the pistol', () => {
    const carbine = aimingLevel();
    const dmr = aimingLevel((w) => w.command({ type: 'setLoadout', slot: 'PRIMARY', weapon: 'DMR' }));
    const pistol = aimingLevel((w) => w.command({ type: 'equip', slot: 'SIDEARM' }));
    const reach = (w: World) => w.player.cover.muzzle.x - w.player.position.x;
    expect(reach(dmr) - reach(carbine)).toBeCloseTo(WEAPONS.DMR.reach, 5);
    expect(reach(pistol) - reach(carbine)).toBeCloseTo(WEAPONS.PISTOL.reach, 5);
    // The shot still leaves the drawn barrel tip.
    expect(dmr.command({ type: 'fire' })!.origin.x).toBeCloseTo(dmr.player.cover.muzzle.x, 6);
  });

  it('sway and recoil differ per weapon', () => {
    const steady = makeWorld('depth-shot');
    steady.command({ type: 'setLoadout', slot: 'PRIMARY', weapon: 'DMR' });
    const shaky = makeWorld('depth-shot');
    shaky.command({ type: 'setLoadout', slot: 'PRIMARY', weapon: 'SMG' });
    for (const w of [steady, shaky]) hold(w, { pointerWorld: { x: 13.6, y: 1.2 }, aim: true });
    seconds(steady, 2);
    seconds(shaky, 2);
    expect(steady.aim.swayAmplitude).toBeLessThan(shaky.aim.swayAmplitude);
    steady.command({ type: 'fire' });
    shaky.command({ type: 'fire' });
    expect(steady.aim.heat).toBeGreaterThan(shaky.aim.heat);
  });
});

describe('v0.2.5 weapons: scopes look further ahead', () => {
  it('aiming a scoped weapon pans the view ahead in the facing direction; unscoped or unaimed does not', () => {
    const w = makeWorld('marksman');
    expect(w.player.loadout.primary).toBe('DMR');
    hold(w, { pointerWorld: { x: -10, y: 1.4 } });
    ticks(w, 2);
    expect(w.snapshot('player').player).toMatchObject({ scoped: false, lookAhead: 0 });
    hold(w, { pointerWorld: { x: -10, y: 1.4 }, aim: true });
    ticks(w, 2);
    const p = w.snapshot('player').player;
    expect(p.scoped).toBe(true);
    expect(p.lookAhead).toBe(WEAPONS.DMR.scope!.lookAhead);
    w.command({ type: 'equip', slot: 'SIDEARM' });
    ticks(w, 2);
    expect(w.snapshot('player').player).toMatchObject({ scoped: false, lookAhead: 0 });
  });
});
