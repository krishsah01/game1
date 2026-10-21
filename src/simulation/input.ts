/** Input contract between the app shell and the simulation. */
import type { MoveMode, Stance } from '../shared/types.ts';
import type { WeaponId } from '../shared/weapons.ts';

export interface HeldInput {
  /** -1 left, 0 none, +1 right */
  moveX: -1 | 0 | 1;
  /** F held: observe above waist-high cover (crouched), or peek around depth cover (off the lane). */
  observe: boolean;
  /** Right mouse held: aim / aim-over cover. */
  aim: boolean;
  /** Pointer position on the z = 0 plane in world units, or null when the canvas does not own the pointer. */
  pointerWorld: { x: number; y: number } | null;
}

export const emptyHeld = (): HeldInput => ({ moveX: 0, observe: false, aim: false, pointerWorld: null });

/** Inventory slots: 1 = primary, 2 = sidearm, 3 = deployable camera. */
export type EquipSlot = 'PRIMARY' | 'SIDEARM' | 'CAMERA';
export type FirearmSlot = Exclude<EquipSlot, 'CAMERA'>;

export type CoverIntent = 'hidden' | 'observe' | 'aimOver' | null;

/**
 * Depth is on/off: LANE is the default z = 0 travel lane, FAR is the far edge
 * of the depth zone the body stands in. W requests FAR, S requests LANE.
 */
export type DepthLane = 'LANE' | 'FAR';

export type Command =
  | { type: 'toggleCrouch' }
  | { type: 'toggleProne' }
  | { type: 'setStance'; stance: Stance }
  | { type: 'setMoveMode'; mode: MoveMode }
  | { type: 'cycleMoveMode' }
  /** LMB: fires the rifle, or places a camera when the camera slot is equipped. */
  | { type: 'fire' }
  | { type: 'equip'; slot: EquipSlot }
  /** Swap the weapon carried in a firearm slot (comes with a full magazine). */
  | { type: 'setLoadout'; slot: FirearmSlot; weapon: WeaponId }
  /** Place a camera at the snap surface nearest `at` (defaults to the pointer). */
  | { type: 'deployCamera'; at?: { x: number; y: number } }
  | { type: 'testFiringLine' }
  | { type: 'reload' }
  /** Depth move (W = FAR, S = LANE). Only honoured inside a depth zone. */
  | { type: 'setDepthLane'; lane: DepthLane }
  /** Space: vault the `isVaultable` obstacle directly ahead. */
  | { type: 'vault' }
  | { type: 'stepDepth'; direction: -1 | 1 }
  | { type: 'setSelectedDepth'; depth: number }
  /** Inspector latch: keep the aim button held without a mouse (fire needs aiming). */
  | { type: 'setAimLatch'; on: boolean }
  | { type: 'toggleBrace' }
  | { type: 'setBrace'; on: boolean }
  /** Latched UI buttons for inspecting cover states without holding keys. */
  | { type: 'setCoverIntent'; intent: CoverIntent }
  | { type: 'setActorMoveMode'; id: string; mode: MoveMode }
  | { type: 'setActorDepth'; id: string; z: number }
  | { type: 'setContestTarget'; index: 0 | 1 }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'togglePause' }
  | { type: 'stepOnce' }
  | { type: 'teleportPlayer'; x: number; z: number; facingX: -1 | 1 };
