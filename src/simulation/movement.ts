/**
 * Collision-aware horizontal movement plus contextual depth movement.
 *
 * The player is an axis-aligned box (BODY_WIDTH x height x BODY_DEPTH) whose
 * feet sit at position.y. Movement is resolved per axis against every
 * collider that blocks movement: X first, then Z. Depth (Z) input is honoured
 * only inside a marked depth zone; while off the default lane inside a zone,
 * horizontal travel is confined to that zone so the player cannot wander the
 * room at an arbitrary depth (a proposed initial constraint, not a final
 * lane-system decision).
 */
import { aabbFromBounds, aabbFromCenterSize, aabbOverlap, clamp, type Aabb } from '../shared/geometry.ts';
import { BODY_DEPTH, BODY_WIDTH, DEPTH_SPEED, LANE_HALF_WIDTH } from '../shared/tuning.ts';
import type { ColliderSeed, DepthZone, Vec3 } from '../shared/types.ts';

export interface MovementBlocker {
  id: string;
  box: Aabb;
}

export const blockersFromColliders = (colliders: ColliderSeed[]): MovementBlocker[] =>
  colliders.filter((c) => c.blocksMovement).map((c) => ({ id: c.id, box: aabbFromBounds(c.bounds) }));

export const bodyBox = (position: Vec3, height: number): Aabb =>
  aabbFromCenterSize({ x: position.x, y: position.y + height / 2, z: position.z }, { x: BODY_WIDTH, y: height, z: BODY_DEPTH });

const EPS = 1e-4;

/** Returns the zone whose XZ footprint contains the point, if any. */
export function zoneAt(zones: DepthZone[], position: Vec3): DepthZone | null {
  for (const zone of zones) {
    const b = aabbFromBounds(zone.bounds);
    if (position.x >= b.min.x && position.x <= b.max.x && position.z >= b.min.z && position.z <= b.max.z) return zone;
  }
  return null;
}

export interface MoveResult {
  position: Vec3;
  blockedX: string | null;
  blockedZ: string | null;
  zone: DepthZone | null;
  movedX: number;
  movedZ: number;
}

/**
 * Move the body by (vx, vz) * dt and resolve collisions.
 * Returns the new position and which colliders stopped the motion.
 */
export function moveBody(
  position: Vec3,
  height: number,
  vx: number,
  vz: number,
  dt: number,
  blockers: MovementBlocker[],
  zones: DepthZone[],
): MoveResult {
  const next: Vec3 = { x: position.x, y: position.y, z: position.z };
  let blockedX: string | null = null;
  let blockedZ: string | null = null;
  const startZone = zoneAt(zones, position);
  const offLane = Math.abs(position.z) > LANE_HALF_WIDTH + EPS;

  // ---- X ----
  if (vx !== 0) {
    const dx = vx * dt;
    let targetX = position.x + dx;
    // Confine horizontal travel to the zone while off the default lane.
    if (startZone && offLane) {
      const zb = aabbFromBounds(startZone.bounds);
      targetX = clamp(targetX, zb.min.x + BODY_WIDTH / 2, zb.max.x - BODY_WIDTH / 2);
    }
    next.x = targetX;
    let box = bodyBox(next, height);
    for (const blocker of blockers) {
      if (!aabbOverlap(box, blocker.box)) continue;
      // Slide to the blocker face.
      if (dx > 0) next.x = Math.min(next.x, blocker.box.min.x - BODY_WIDTH / 2 - EPS);
      else next.x = Math.max(next.x, blocker.box.max.x + BODY_WIDTH / 2 + EPS);
      blockedX = blocker.id;
      box = bodyBox(next, height);
    }
  }

  // ---- Z (contextual) ----
  const zone = zoneAt(zones, next) ?? (startZone && offLane ? startZone : null);
  if (vz !== 0 && zone) {
    const zb = aabbFromBounds(zone.bounds);
    const dz = vz * dt;
    next.z = clamp(position.z + dz, zb.min.z, zb.max.z);
    let box = bodyBox(next, height);
    for (const blocker of blockers) {
      if (!aabbOverlap(box, blocker.box)) continue;
      if (dz > 0) next.z = Math.min(next.z, blocker.box.min.z - BODY_DEPTH / 2 - EPS);
      else next.z = Math.max(next.z, blocker.box.max.z + BODY_DEPTH / 2 + EPS);
      blockedZ = blocker.id;
      box = bodyBox(next, height);
    }
  }

  return {
    position: next,
    blockedX,
    blockedZ,
    zone: zoneAt(zones, next),
    movedX: next.x - position.x,
    movedZ: next.z - position.z,
  };
}

export const depthSpeed = DEPTH_SPEED;
