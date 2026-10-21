/** Input contract between the app shell and the simulation. */
import type { MoveMode, Stance } from '../shared/types.ts';

export interface HeldInput {
  /** -1 left, 0 none, +1 right */
  moveX: -1 | 0 | 1;
  /** -1 = toward the camera (NEAR, +Z), +1 = into the screen (FAR, -Z). 0 none. */
  moveZ: -1 | 0 | 1;
  /** Space held: observe above cover (crouched at cover only). */
  observe: boolean;
  /** Right mouse held: aim / aim-over cover. */
  aim: boolean;
  /** Pointer position on the z = 0 plane in world units, or null when the canvas does not own the pointer. */
  pointerWorld: { x: number; y: number } | null;
}

export const emptyHeld = (): HeldInput => ({ moveX: 0, moveZ: 0, observe: false, aim: false, pointerWorld: null });

export type CoverIntent = 'hidden' | 'observe' | 'aimOver' | null;

export type Command =
  | { type: 'toggleCrouch' }
  | { type: 'setStance'; stance: Stance }
  | { type: 'setMoveMode'; mode: MoveMode }
  | { type: 'fire' }
  | { type: 'testFiringLine' }
  | { type: 'reload' }
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
