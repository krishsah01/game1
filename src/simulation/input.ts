/** Input contract between the app shell and the simulation. */
import type { MoveMode, Stance } from '../shared/types.ts';

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
  | { type: 'fire' }
  | { type: 'testFiringLine' }
  | { type: 'reload' }
  /** Depth move (W = FAR, S = LANE). Only honoured inside a depth zone. */
  | { type: 'setDepthLane'; lane: DepthLane }
  /** Space: vault the `isVaultable` obstacle directly ahead. */
  | { type: 'vault' }
  | { type: 'stepDepth'; direction: -1 | 1 }
  | { type: 'setSelectedDepth'; depth: number }
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
