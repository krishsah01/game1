/**
 * Weapon catalogue (v0.2.5). The player carries one primary and one sidearm
 * at the same time (inventory slots 1 and 2). Every number is a reversible
 * prototype value.
 *
 * `reach` shifts the mechanical muzzle along the barrel relative to the
 * carbine (a longer barrel sticks out further; a pistol sits closer), so the
 * firing origin is still the visible barrel tip.
 */
export type WeaponId = 'CARBINE' | 'DMR' | 'SMG' | 'PISTOL' | 'MACHINE_PISTOL';
export type WeaponClass = 'PRIMARY' | 'SIDEARM';

export interface ScopeSpec {
  /** Nominal magnification, for the HUD. */
  magnification: number;
  /** While aiming, the view pans this many metres further in the facing direction. */
  lookAhead: number;
}

export interface WeaponSpec {
  id: WeaponId;
  label: string;
  class: WeaponClass;
  magazine: number;
  /** Muzzle reach relative to the carbine, metres. */
  reach: number;
  /** Multiplier on the situational depth-sway amplitude. */
  sway: number;
  /** Recoil heat added per shot (see SWAY.heatMax). */
  heatPerShot: number;
  scope: ScopeSpec | null;
  /** Rendering only. */
  model: { length: number; stock: boolean; optic: 'none' | 'red-dot' | 'scope'; grip: 'rifle' | 'pistol' };
}

export const WEAPONS: Record<WeaponId, WeaponSpec> = {
  CARBINE: {
    id: 'CARBINE',
    label: 'CARBINE',
    class: 'PRIMARY',
    magazine: 24,
    reach: 0,
    sway: 1,
    heatPerShot: 0.35,
    scope: null,
    model: { length: 0.62, stock: true, optic: 'red-dot', grip: 'rifle' },
  },
  DMR: {
    id: 'DMR',
    label: 'DMR 4×',
    class: 'PRIMARY',
    magazine: 10,
    reach: 0.16,
    sway: 0.85,
    heatPerShot: 0.7,
    scope: { magnification: 4, lookAhead: 7 },
    model: { length: 0.84, stock: true, optic: 'scope', grip: 'rifle' },
  },
  SMG: {
    id: 'SMG',
    label: 'SMG',
    class: 'PRIMARY',
    magazine: 30,
    reach: -0.12,
    sway: 1.15,
    heatPerShot: 0.22,
    scope: null,
    model: { length: 0.46, stock: true, optic: 'none', grip: 'rifle' },
  },
  PISTOL: {
    id: 'PISTOL',
    label: 'PISTOL',
    class: 'SIDEARM',
    magazine: 15,
    reach: -0.1,
    sway: 1.3,
    heatPerShot: 0.3,
    scope: null,
    model: { length: 0.2, stock: false, optic: 'none', grip: 'pistol' },
  },
  MACHINE_PISTOL: {
    id: 'MACHINE_PISTOL',
    label: 'MACHINE PISTOL',
    class: 'SIDEARM',
    magazine: 20,
    reach: -0.08,
    sway: 1.5,
    heatPerShot: 0.26,
    scope: null,
    model: { length: 0.26, stock: false, optic: 'none', grip: 'pistol' },
  },
};

export const PRIMARIES: WeaponId[] = ['CARBINE', 'DMR', 'SMG'];
export const SIDEARMS: WeaponId[] = ['PISTOL', 'MACHINE_PISTOL'];

export interface Loadout {
  primary: WeaponId;
  sidearm: WeaponId;
}

export const DEFAULT_LOADOUT: Loadout = { primary: 'CARBINE', sidearm: 'PISTOL' };
