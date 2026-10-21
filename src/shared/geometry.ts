/**
 * Small analytic geometry helpers. No Three.js dependency so the simulation
 * and the tests can run in Node without a renderer.
 */
import type { Bounds, Vec3 } from './types.ts';

export interface Aabb {
  min: Vec3;
  max: Vec3;
}

export const aabbFromBounds = (b: Bounds): Aabb => ({
  min: { x: b.center.x - b.size.x / 2, y: b.center.y - b.size.y / 2, z: b.center.z - b.size.z / 2 },
  max: { x: b.center.x + b.size.x / 2, y: b.center.y + b.size.y / 2, z: b.center.z + b.size.z / 2 },
});

export const aabbFromCenterSize = (c: Vec3, s: Vec3): Aabb => aabbFromBounds({ center: c, size: s });

export const aabbOverlap = (a: Aabb, b: Aabb): boolean =>
  a.min.x < b.max.x && a.max.x > b.min.x && a.min.y < b.max.y && a.max.y > b.min.y && a.min.z < b.max.z && a.max.z > b.min.z;

export const pointInAabb = (p: Vec3, a: Aabb): boolean =>
  p.x >= a.min.x && p.x <= a.max.x && p.y >= a.min.y && p.y <= a.max.y && p.z >= a.min.z && p.z <= a.max.z;

export const pointInBounds = (p: Vec3, b: Bounds): boolean => pointInAabb(p, aabbFromBounds(b));

export const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const scale = (a: Vec3, s: number): Vec3 => ({ x: a.x * s, y: a.y * s, z: a.z * s });
export const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
export const length = (a: Vec3): number => Math.sqrt(dot(a, a));
export const distance = (a: Vec3, b: Vec3): number => length(sub(a, b));
export const normalize = (a: Vec3): Vec3 => {
  const l = length(a);
  return l > 1e-9 ? scale(a, 1 / l) : { x: 0, y: 0, z: 0 };
};
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/**
 * Slab test: parametric entry/exit of a ray (origin + t*dir) against a box.
 * Returns null when there is no intersection for t in [0, maxT].
 * Handles rays starting inside the box (tEntry = 0).
 */
export function rayAabb(origin: Vec3, dir: Vec3, box: Aabb, maxT: number): { tEntry: number; tExit: number } | null {
  let tmin = 0;
  let tmax = maxT;
  const o = [origin.x, origin.y, origin.z];
  const d = [dir.x, dir.y, dir.z];
  const mn = [box.min.x, box.min.y, box.min.z];
  const mx = [box.max.x, box.max.y, box.max.z];
  for (let i = 0; i < 3; i++) {
    const oi = o[i]!;
    const di = d[i]!;
    const lo = mn[i]!;
    const hi = mx[i]!;
    if (Math.abs(di) < 1e-12) {
      if (oi < lo || oi > hi) return null;
      continue;
    }
    const inv = 1 / di;
    let t1 = (lo - oi) * inv;
    let t2 = (hi - oi) * inv;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
    }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  return { tEntry: tmin, tExit: tmax };
}

/**
 * Segment a→b against a box. Returns the fraction (0..1) along the segment
 * where the box is first touched, or null when the segment misses it.
 */
export function segmentAabb(a: Vec3, b: Vec3, box: Aabb): number | null {
  const d = sub(b, a);
  const hit = rayAabb(a, d, box, 1);
  return hit ? hit.tEntry : null;
}

/** Angle in degrees between two vectors (0 when either is zero-length). */
export function angleBetweenDeg(a: Vec3, b: Vec3): number {
  const la = length(a);
  const lb = length(b);
  if (la < 1e-9 || lb < 1e-9) return 0;
  const c = clamp(dot(a, b) / (la * lb), -1, 1);
  return (Math.acos(c) * 180) / Math.PI;
}
