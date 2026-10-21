/**
 * Mechanical cover state and head/muzzle anchors.
 *
 * Sight begins at the eye anchor. Fire begins at the muzzle anchor. Each
 * mechanical state moves BOTH anchors; animation only interpolates toward
 * them and never decides collision or visibility.
 *
 * The arms follow the aim point: the muzzle swings around the rifle pivot by
 * the aim pitch (clamped per stance). The visible barrel and the firing
 * origin are therefore the same thing. Hidden and observe keep the rifle
 * lowered (no pitch), so the "muzzle still blocked" state stays crisp.
 */
import { aabbFromBounds, clamp, type Aabb } from '../shared/geometry.ts';
import {
  AIM_PITCH_LIMITS,
  ANCHORS,
  BODY_DEPTH,
  BODY_WIDTH,
  BRACE_REACH,
  BRACE_Z_SLACK,
  COVER_REACH,
  COVER_TOP_MAX,
  COVER_TOP_MIN,
  VAULT,
  type CoverState,
  type StanceAnchors,
} from '../shared/tuning.ts';
import type { ColliderSeed, Stance, Vec3 } from '../shared/types.ts';

export interface CoverCandidate {
  id: string;
  box: Aabb;
  isCover: boolean;
  /** Waist-high: a crouched body can hide behind it and peek over. */
  waistHigh: boolean;
  /** Explicit seed flag: the body may go over it with Space. */
  isVaultable: boolean;
}

export const coverCandidates = (colliders: ColliderSeed[]): CoverCandidate[] =>
  colliders
    .filter((c) => c.blocksMovement)
    .map((c) => {
      const box = aabbFromBounds(c.bounds);
      const top = box.max.y;
      return {
        id: c.id,
        box,
        isCover: c.isCover,
        waistHigh: c.isCover && c.blocksSight && top >= COVER_TOP_MIN && top <= COVER_TOP_MAX && box.min.y <= 0.05,
        isVaultable: c.isVaultable && top >= VAULT.topMin && top <= VAULT.topMax,
      };
    });

/** Nearest candidate directly ahead of the body, overlapping its depth footprint, within reach. */
function nearestAhead(
  position: Vec3,
  facingX: -1 | 1,
  candidates: CoverCandidate[],
  reach: number,
  accept: (c: CoverCandidate) => boolean,
  zSlack = 0,
): CoverCandidate | null {
  const front = position.x + (facingX * BODY_WIDTH) / 2;
  const zMin = position.z - BODY_DEPTH / 2 - zSlack;
  const zMax = position.z + BODY_DEPTH / 2 + zSlack;
  let best: CoverCandidate | null = null;
  let bestGap = Infinity;
  for (const c of candidates) {
    if (!accept(c)) continue;
    if (c.box.max.z < zMin || c.box.min.z > zMax) continue;
    const gap = facingX > 0 ? c.box.min.x - front : front - c.box.max.x;
    if (gap < -0.05 || gap > reach) continue;
    if (gap < bestGap) {
      bestGap = gap;
      best = c;
    }
  }
  return best;
}

/**
 * Finds a cover object directly ahead of the body (in facing direction),
 * overlapping the body's depth footprint, within reach.
 */
export function findCoverAhead(
  position: Vec3,
  facingX: -1 | 1,
  candidates: CoverCandidate[],
  reach: number,
  waistHighOnly: boolean,
  zSlack = 0,
): CoverCandidate | null {
  return nearestAhead(position, facingX, candidates, reach, (c) => c.isCover && (!waistHighOnly || c.waistHigh), zSlack);
}

/** Finds the vaultable obstacle directly ahead within vault reach. */
export function findVaultableAhead(position: Vec3, facingX: -1 | 1, candidates: CoverCandidate[]): CoverCandidate | null {
  return nearestAhead(position, facingX, candidates, VAULT.reach, (c) => c.isVaultable);
}

export interface CoverEvaluation {
  state: CoverState;
  nearCover: CoverCandidate | null;
  braceable: CoverCandidate | null;
  anchors: StanceAnchors;
  eye: Vec3;
  muzzle: Vec3;
  /** Rifle pivot the muzzle swings around. */
  pivot: Vec3;
  /** Applied aim pitch in radians (0 while hidden, observing or vaulting). */
  aimPitch: number;
  /** True when the muzzle was pulled back to a solid face (rifle pressed against cover). */
  muzzleClamped: boolean;
  stance: Stance;
  aiming: boolean;
}

export interface CoverInputs {
  position: Vec3;
  facingX: -1 | 1;
  stance: Stance;
  moving: boolean;
  observeHeld: boolean;
  aimHeld: boolean;
  sprinting: boolean;
  /** Requested aim pitch in radians (positive = up), derived from the pointer. */
  aimPitch: number;
  /** A vault is in progress: tucked anchors, no cover state, rifle lowered. */
  vaulting: boolean;
}

/**
 * Resolves the mechanical state for this tick.
 *
 * | state   | eye                | muzzle             |
 * | hidden  | below barrier top  | below barrier top  |
 * | observe | just clears top    | still below top    |
 * | aimOver | clears top         | clears top         |
 *
 * Prone has no cover state: its eye simply sits below any waist-high top.
 */
export function evaluateCover(input: CoverInputs, candidates: CoverCandidate[]): CoverEvaluation {
  const nearCover = findCoverAhead(input.position, input.facingX, candidates, COVER_REACH, true);
  const braceable = findCoverAhead(input.position, input.facingX, candidates, BRACE_REACH, false, BRACE_Z_SLACK);
  const aiming = input.aimHeld && !input.sprinting && !input.vaulting;

  let state: CoverState = 'none';
  let anchors: StanceAnchors;
  if (input.vaulting) anchors = ANCHORS.vault;
  else if (input.stance === 'PRONE') anchors = ANCHORS.prone;
  else if (input.stance === 'CROUCHED') anchors = ANCHORS.crouched;
  else anchors = aiming ? ANCHORS.standingAim : ANCHORS.standing;

  if (!input.vaulting && input.stance === 'CROUCHED' && nearCover) {
    if (aiming && !input.moving) {
      state = 'aimOver';
      anchors = ANCHORS.aimOver;
    } else if (input.observeHeld && !input.moving) {
      state = 'observe';
      anchors = ANCHORS.observe;
    } else {
      state = 'hidden';
      anchors = ANCHORS.crouched;
    }
  }

  const pitchAllowed = !input.vaulting && (state === 'none' || state === 'aimOver');
  const limits = AIM_PITCH_LIMITS[input.stance];
  const pitch = pitchAllowed ? clamp(input.aimPitch, (-limits.down * Math.PI) / 180, (limits.up * Math.PI) / 180) : 0;

  const f = input.facingX;
  const pos = input.position;
  const eye: Vec3 = { x: pos.x + f * anchors.eyeForward, y: pos.y + anchors.eyeY, z: pos.z };
  const pivot: Vec3 = { x: pos.x + f * anchors.pivotForward, y: pos.y + anchors.pivotY, z: pos.z };
  // Muzzle = pivot + rotated rest offset; at zero pitch it is exactly (muzzleForward, muzzleY).
  const ox = anchors.muzzleForward - anchors.pivotForward;
  const oy = anchors.muzzleY - anchors.pivotY;
  const c = Math.cos(pitch);
  const s = Math.sin(pitch);
  const muzzle: Vec3 = { x: pivot.x + f * (ox * c - oy * s), y: pivot.y + ox * s + oy * c, z: pos.z };
  return { state, nearCover, braceable, anchors, eye, muzzle, pivot, aimPitch: pitch, muzzleClamped: false, stance: input.stance, aiming };
}
