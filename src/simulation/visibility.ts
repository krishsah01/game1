/**
 * Observation tests against proxy geometry and smoke.
 *
 * An observer (player head or recon camera) sees a sample point when:
 *   1. it is within range and inside the observer's field of view,
 *   2. the segment observer→sample touches no sight-blocking collider,
 *   3. the segment does not pass through active smoke.
 *
 * Dynamic entities expose several body samples (head, chest, pelvis). An
 * entity counts as observed once VISIBLE_SAMPLE_THRESHOLD samples are clear,
 * so an exposed head is enough to communicate a peek.
 *
 * This runs against gameplay proxies only; decorative mesh detail never
 * participates.
 */
import { aabbFromBounds, angleBetweenDeg, distance, segmentAabb, sub, type Aabb } from '../shared/geometry.ts';
import { BODY_SAMPLES, VISIBLE_SAMPLE_THRESHOLD } from '../shared/tuning.ts';
import type { ColliderSeed, Vec3 } from '../shared/types.ts';

export interface Observer {
  id: string;
  origin: Vec3;
  /** Unit-ish direction the observer faces. */
  facing: Vec3;
  fovDegrees: number;
  range: number;
}

export interface SightBlocker {
  id: string;
  box: Aabb;
}

export const sightBlockersFromColliders = (colliders: ColliderSeed[]): SightBlocker[] =>
  colliders.filter((c) => c.blocksSight).map((c) => ({ id: c.id, box: aabbFromBounds(c.bounds) }));

export type SampleReason = 'clear' | 'range' | 'fov' | 'blocked' | 'smoke';

export interface SampleResult {
  name: string;
  point: Vec3;
  reason: SampleReason;
  /** First obstruction id when blocked. */
  blockedBy: string | null;
  /** Fraction along observer→sample where the obstruction starts (1 = reached sample). */
  clipT: number;
}

export interface Samplable {
  id: string;
  samples: { name: string; point: Vec3 }[];
}

/** Body samples for an actor whose feet are at `position` with collider `height`. */
export function actorSamples(position: Vec3, height: number): { name: string; point: Vec3 }[] {
  return BODY_SAMPLES.map((s) => ({ name: s.name, point: { x: position.x, y: position.y + height * s.fraction, z: position.z } }));
}

export function testSample(
  observer: Observer,
  point: Vec3,
  blockers: SightBlocker[],
  smoke: Aabb | null,
  excludeId: string | null = null,
): SampleResult {
  const name = '';
  const d = distance(observer.origin, point);
  if (d > observer.range) return { name, point, reason: 'range', blockedBy: null, clipT: 1 };
  const toPoint = sub(point, observer.origin);
  if (angleBetweenDeg(observer.facing, toPoint) > observer.fovDegrees / 2) return { name, point, reason: 'fov', blockedBy: null, clipT: 1 };
  let nearest = 1;
  let blockedBy: string | null = null;
  for (const b of blockers) {
    if (excludeId !== null && b.id === excludeId) continue;
    const t = segmentAabb(observer.origin, point, b.box);
    if (t !== null && t < nearest) {
      nearest = t;
      blockedBy = b.id;
    }
  }
  if (blockedBy !== null && nearest < 1 - 1e-6) return { name, point, reason: 'blocked', blockedBy, clipT: nearest };
  if (smoke) {
    const t = segmentAabb(observer.origin, point, smoke);
    if (t !== null && t < 1 - 1e-6) return { name, point, reason: 'smoke', blockedBy: 'smoke', clipT: t };
  }
  return { name, point, reason: 'clear', blockedBy: null, clipT: 1 };
}

export interface EntityObservation {
  observerId: string;
  entityId: string;
  visibleSamples: number;
  observed: boolean;
  samples: SampleResult[];
}

export function observeEntity(observer: Observer, entity: Samplable, blockers: SightBlocker[], smoke: Aabb | null): EntityObservation {
  const samples = entity.samples.map((s) => ({ ...testSample(observer, s.point, blockers, smoke), name: s.name }));
  const visibleSamples = samples.filter((s) => s.reason === 'clear').length;
  return { observerId: observer.id, entityId: entity.id, visibleSamples, observed: visibleSamples >= VISIBLE_SAMPLE_THRESHOLD, samples };
}

/**
 * Static architecture is always drawn; this only decides how brightly.
 * Probes sit on the collider's surfaces; the collider itself is excluded from
 * the obstruction test. Returns the fraction of probes any observer can see.
 */
export function staticProbes(collider: ColliderSeed): Vec3[] {
  const b = aabbFromBounds(collider.bounds);
  const xs = [b.min.x + (b.max.x - b.min.x) * 0.2, (b.min.x + b.max.x) / 2, b.min.x + (b.max.x - b.min.x) * 0.8];
  const midY = (b.min.y + b.max.y) / 2;
  const midZ = (b.min.z + b.max.z) / 2;
  const probes: Vec3[] = [];
  for (const x of xs) {
    probes.push({ x, y: Math.min(b.max.y, Math.max(b.min.y, midY)), z: b.max.z + 0.01 }); // front face
    probes.push({ x, y: b.max.y + 0.01, z: midZ }); // top face
  }
  return probes;
}

export function staticLitFraction(collider: ColliderSeed, observers: Observer[], blockers: SightBlocker[], smoke: Aabb | null): number {
  const probes = staticProbes(collider);
  if (observers.length === 0) return 0;
  let seen = 0;
  for (const p of probes) {
    for (const o of observers) {
      if (testSample(o, p, blockers, smoke, collider.id).reason === 'clear') {
        seen += 1;
        break;
      }
    }
  }
  return seen / probes.length;
}
