/**
 * Mechanical cover state and head/muzzle anchors.
 *
 * Sight begins at the eye anchor. Fire begins at the muzzle anchor. Each
 * mechanical state moves BOTH anchors; animation only interpolates toward
 * them and never decides collision or visibility.
 */
import { aabbFromBounds, type Aabb } from '../shared/geometry.ts';
import {
  ANCHORS,
  BODY_DEPTH,
  BODY_WIDTH,
  BRACE_REACH,
  BRACE_Z_SLACK,
  COVER_REACH,
  COVER_TOP_MAX,
  COVER_TOP_MIN,
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
}

export const coverCandidates = (colliders: ColliderSeed[]): CoverCandidate[] =>
  colliders
    .filter((c) => c.blocksMovement && c.blocksSight)
    .map((c) => {
      const box = aabbFromBounds(c.bounds);
      const top = box.max.y;
      return { id: c.id, box, isCover: c.isCover, waistHigh: c.isCover && top >= COVER_TOP_MIN && top <= COVER_TOP_MAX && box.min.y <= 0.05 };
    });

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
  const front = position.x + (facingX * BODY_WIDTH) / 2;
  const zMin = position.z - BODY_DEPTH / 2 - zSlack;
  const zMax = position.z + BODY_DEPTH / 2 + zSlack;
  let best: CoverCandidate | null = null;
  let bestGap = Infinity;
  for (const c of candidates) {
    if (!c.isCover) continue;
    if (waistHighOnly && !c.waistHigh) continue;
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

export interface CoverEvaluation {
  state: CoverState;
  nearCover: CoverCandidate | null;
  braceable: CoverCandidate | null;
  anchors: StanceAnchors;
  eye: Vec3;
  muzzle: Vec3;
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
}

/**
 * Resolves the mechanical state for this tick.
 *
 * | state   | eye                | muzzle             |
 * | hidden  | below barrier top  | below barrier top  |
 * | observe | just clears top    | still below top    |
 * | aimOver | clears top         | clears top         |
 */
export function evaluateCover(input: CoverInputs, candidates: CoverCandidate[]): CoverEvaluation {
  const nearCover = findCoverAhead(input.position, input.facingX, candidates, COVER_REACH, true);
  const braceable = findCoverAhead(input.position, input.facingX, candidates, BRACE_REACH, false, BRACE_Z_SLACK);
  const aiming = input.aimHeld && !input.sprinting;

  let state: CoverState = 'none';
  let anchors: StanceAnchors = input.stance === 'CROUCHED' ? ANCHORS.crouched : aiming ? ANCHORS.standingAim : ANCHORS.standing;

  if (input.stance === 'CROUCHED' && nearCover) {
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

  const f = input.facingX;
  const eye: Vec3 = { x: input.position.x + f * anchors.eyeForward, y: input.position.y + anchors.eyeY, z: input.position.z };
  const muzzle: Vec3 = { x: input.position.x + f * anchors.muzzleForward, y: input.position.y + anchors.muzzleY, z: input.position.z };
  return { state, nearCover, braceable, anchors, eye, muzzle, stance: input.stance, aiming };
}
