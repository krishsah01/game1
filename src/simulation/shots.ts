/**
 * First-hit 3D collision queries for demonstrator shots (hitscan).
 *
 * Every blocker and every actor hit proxy is tested analytically (ray vs
 * axis-aligned box) and the closest intersection wins. Cover closer than a
 * target wins. Nothing here looks at reticle colour, visibility state or
 * mesh `visible` flags.
 */
import { add, aabbFromBounds, length, normalize, rayAabb, scale, sub, type Aabb } from '../shared/geometry.ts';
import { SHOT_MAX_RANGE } from '../shared/tuning.ts';
import type { ColliderSeed, Vec3 } from '../shared/types.ts';

export interface ShotTarget {
  kind: 'collider' | 'actor';
  id: string;
  label: string;
  box: Aabb;
}

export const shotTargetsFromColliders = (colliders: ColliderSeed[]): ShotTarget[] =>
  colliders.filter((c) => c.blocksShots).map((c) => ({ kind: 'collider', id: c.id, label: c.visualRole, box: aabbFromBounds(c.bounds) }));

export interface ShotHit {
  kind: 'collider' | 'actor';
  id: string;
  label: string;
  t: number;
  point: Vec3;
}

export interface ShotResult {
  origin: Vec3;
  direction: Vec3;
  aimPoint: Vec3;
  end: Vec3;
  distance: number;
  hit: ShotHit | null;
  /** Nearest static obstruction regardless of actors (for presentation that must not leak hidden actors). */
  staticHit: ShotHit | null;
}

export function resolveShot(muzzle: Vec3, aimPoint: Vec3, targets: ShotTarget[], fallbackDirection: Vec3, maxRange = SHOT_MAX_RANGE): ShotResult {
  let dir = sub(aimPoint, muzzle);
  if (length(dir) < 1e-5) dir = fallbackDirection;
  dir = normalize(dir);
  if (length(dir) < 1e-6) dir = { x: 1, y: 0, z: 0 };

  let best: ShotHit | null = null;
  let bestStatic: ShotHit | null = null;
  for (const target of targets) {
    const r = rayAabb(muzzle, dir, target.box, maxRange);
    if (!r) continue;
    // Ignore boxes the muzzle starts inside (should not happen: anchors are kept outside solids).
    if (r.tEntry <= 1e-6 && r.tExit > 0 && target.kind === 'collider') continue;
    const hit: ShotHit = { kind: target.kind, id: target.id, label: target.label, t: r.tEntry, point: add(muzzle, scale(dir, r.tEntry)) };
    if (!best || r.tEntry < best.t) best = hit;
    if (target.kind === 'collider' && (!bestStatic || r.tEntry < bestStatic.t)) bestStatic = hit;
  }
  const dist = best ? best.t : maxRange;
  return { origin: muzzle, direction: dir, aimPoint, end: add(muzzle, scale(dir, dist)), distance: dist, hit: best, staticHit: bestStatic };
}
