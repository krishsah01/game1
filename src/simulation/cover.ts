/**
 * Mechanical cover state and head/muzzle anchors.
 *
 * Sight begins at the eye anchor. Fire begins at the muzzle anchor. Each
 * mechanical state moves BOTH anchors; animation only interpolates toward
 * them and never decides collision or visibility.
 *
 * Aiming (v0.2.3): only while the aim button is held do the arms point the
 * rifle at the pointer (pitch clamped per stance). Otherwise the rifle rests
 * at low ready, muzzle toward the ground (LOW_READY_PITCH), and cannot fire.
 * The muzzle swings around the rifle pivot either way, so the visible barrel
 * and the firing origin are the same thing. Hidden, observe, peek and vault
 * keep the rifle at low ready, so the "muzzle still blocked" state stays crisp.
 * At waist-high cover, observe + aim (or aim alone) raises the rifle over the
 * top: aim-over exposes a little more of the body but can shoot.
 *
 * Depth cover: off the lane, with full-height cover directly ahead, hold F
 * peeks. Only the eye leans toward the lane (around the cover's edge); the
 * body collider and the lowered rifle stay behind the cover.
 */
import { aabbFromBounds, clamp, rayAabb, type Aabb } from '../shared/geometry.ts';
import {
  AIM_PITCH_LIMITS,
  ANCHORS,
  LOW_READY_PITCH,
  BODY_DEPTH,
  BODY_WIDTH,
  BRACE_REACH,
  BRACE_Z_SLACK,
  COVER_REACH,
  COVER_TOP_MAX,
  COVER_TOP_MIN,
  LANE_HALF_WIDTH,
  PEEK,
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
  /** Floor-standing cover too tall to see over: off the lane it is depth cover to peek around. */
  fullHeight: boolean;
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
        fullHeight: c.isCover && c.blocksSight && top > COVER_TOP_MAX && box.min.y <= 0.05,
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

/** Signed lean (z) that brings the eye just past the cover's lane-side edge. */
const leanToClear = (z: number, cover: CoverCandidate): number => {
  const toLane = z > 0 ? -1 : 1;
  const edge = toLane > 0 ? cover.box.max.z : cover.box.min.z;
  return edge + toLane * PEEK.clearance - z;
};

/**
 * Depth cover: the body is off the lane and full-height cover stands directly
 * ahead, with its lane-side edge within a peek's lean. Returns that cover.
 */
export function findDepthCover(position: Vec3, facingX: -1 | 1, candidates: CoverCandidate[]): CoverCandidate | null {
  if (Math.abs(position.z) <= LANE_HALF_WIDTH) return null;
  const toLane = position.z > 0 ? -1 : 1;
  return nearestAhead(position, facingX, candidates, COVER_REACH, (c) => {
    if (!c.fullHeight) return false;
    const lean = leanToClear(position.z, c) * toLane;
    return lean > 0 && lean <= PEEK.maxLean;
  });
}

export interface CoverEvaluation {
  state: CoverState;
  nearCover: CoverCandidate | null;
  braceable: CoverCandidate | null;
  /** Full-height cover ahead while off the lane (hold F to peek around it). */
  depthCover: CoverCandidate | null;
  /** Signed z offset of the eye from the body while peeking (0 otherwise). */
  peekLean: number;
  anchors: StanceAnchors;
  eye: Vec3;
  muzzle: Vec3;
  /** Rifle pivot the muzzle swings around. */
  pivot: Vec3;
  /** Applied rifle pitch in radians: toward the pointer while aiming, else the stance's low-ready pitch. */
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
  /** Muzzle reach of the equipped weapon relative to the carbine (WeaponSpec.reach). */
  weaponReach?: number;
}

/**
 * Resolves the mechanical state for this tick.
 *
 * | state   | eye                | muzzle             |
 * | hidden  | below barrier top  | below barrier top  |
 * | observe | just clears top    | still below top    |
 * | aimOver | clears top         | clears top         |
 * | peek    | leans past the side edge of depth cover | stays behind it |
 *
 * Prone has no cover state: its eye simply sits below any waist-high top.
 */
export function evaluateCover(input: CoverInputs, candidates: CoverCandidate[]): CoverEvaluation {
  const nearCover = findCoverAhead(input.position, input.facingX, candidates, COVER_REACH, true);
  const depthCover = input.vaulting || input.stance === 'PRONE' ? null : findDepthCover(input.position, input.facingX, candidates);
  const braceable = findCoverAhead(input.position, input.facingX, candidates, BRACE_REACH, false, BRACE_Z_SLACK);
  const aiming = input.aimHeld && !input.sprinting && !input.vaulting;

  let state: CoverState = 'none';
  let anchors: StanceAnchors;
  if (input.vaulting) anchors = ANCHORS.vault;
  else if (input.stance === 'PRONE') anchors = ANCHORS.prone;
  else if (input.stance === 'CROUCHED') anchors = ANCHORS.crouched;
  else anchors = aiming ? ANCHORS.standingAim : ANCHORS.standing;
  const reach = input.weaponReach ?? 0;
  const withReach = (a: StanceAnchors): StanceAnchors => (reach === 0 ? a : { ...a, muzzleForward: a.muzzleForward + reach });
  anchors = withReach(anchors);

  if (!input.vaulting && input.stance === 'CROUCHED' && nearCover) {
    if (aiming && !input.moving) {
      state = 'aimOver';
      anchors = withReach(ANCHORS.aimOver);
    } else if (input.observeHeld && !input.moving) {
      state = 'observe';
      anchors = withReach(ANCHORS.observe);
    } else {
      state = 'hidden';
      anchors = withReach(ANCHORS.crouched);
    }
  }
  let peekLean = 0;
  if (state === 'none' && depthCover && input.observeHeld && !aiming && !input.moving) {
    state = 'peek';
    peekLean = leanAroundCover(input.position, input.facingX, anchors, depthCover, candidates);
  }

  const pointed = aiming && (state === 'none' || state === 'aimOver');
  const limits = AIM_PITCH_LIMITS[input.stance];
  const pitch = pointed ? clamp(input.aimPitch, (-limits.down * Math.PI) / 180, (limits.up * Math.PI) / 180) : (LOW_READY_PITCH[input.stance] * Math.PI) / 180;

  const f = input.facingX;
  const pos = input.position;
  const eye: Vec3 = { x: pos.x + f * anchors.eyeForward, y: pos.y + anchors.eyeY, z: pos.z + peekLean };
  const pivot: Vec3 = { x: pos.x + f * anchors.pivotForward, y: pos.y + anchors.pivotY, z: pos.z };
  // Muzzle = pivot + rotated rest offset; at zero pitch it is exactly (muzzleForward, muzzleY).
  const ox = anchors.muzzleForward - anchors.pivotForward;
  const oy = anchors.muzzleY - anchors.pivotY;
  const c = Math.cos(pitch);
  const s = Math.sin(pitch);
  const muzzle: Vec3 = { x: pivot.x + f * (ox * c - oy * s), y: pivot.y + ox * s + oy * c, z: pos.z };
  return { state, nearCover, braceable, depthCover, peekLean, anchors, eye, muzzle, pivot, aimPitch: pitch, muzzleClamped: false, stance: input.stance, aiming };
}

/** Lean toward the lane to clear `cover`, stopped short of any solid the head would enter. */
function leanAroundCover(position: Vec3, facingX: -1 | 1, anchors: StanceAnchors, cover: CoverCandidate, candidates: CoverCandidate[]): number {
  const lean = leanToClear(position.z, cover);
  const dir = Math.sign(lean);
  const reach = Math.abs(lean);
  const head: Vec3 = { x: position.x + facingX * anchors.eyeForward, y: position.y + anchors.eyeY, z: position.z };
  let nearest = reach;
  for (const c of candidates) {
    const r = rayAabb(head, { x: 0, y: 0, z: dir }, c.box, reach);
    if (r && r.tEntry >= 0 && r.tEntry < nearest) nearest = r.tEntry;
  }
  return dir * (nearest < reach ? Math.max(0, nearest - 0.05) : reach);
}
