/**
 * Deployable camera placement (v0.2.2).
 *
 * Cameras live on the lane plane (z = 0), so placement is a 2D problem in X/Y:
 * every movement-blocking collider that crosses z = 0 is a rectangle, and each
 * of its four faces is a candidate surface. The device snaps to the exposed
 * face point nearest the pointer:
 *   floor top            → GROUND
 *   ceiling or lintel underside → CEILING
 *   side of a wall/jamb  → WALL
 *   any face of a prop (low wall, crate, terminal, locker...) → COVER
 * A face is exposed when the device box placed on it does not overlap any
 * other solid. The device must also be within reach of the body, with a clear
 * line from the chest (no placing through walls; reaching over the top of the
 * cover you are behind is allowed).
 */
import { aabbFromBounds, aabbFromCenterSize, aabbOverlap, clamp, segmentAabb, type Aabb } from '../shared/geometry.ts';
import { CAMERA } from '../shared/tuning.ts';
import type { CameraMount, ColliderSeed, Team, Vec3, ReconCameraSeed } from '../shared/types.ts';

export interface PlacementSurface {
  colliderId: string;
  box: Aabb;
  visualRole: string;
  blocksSight: boolean;
}

export const placementSurfaces = (colliders: ColliderSeed[]): PlacementSurface[] =>
  colliders
    .filter((c) => c.blocksMovement)
    .map((c) => ({ colliderId: c.id, box: aabbFromBounds(c.bounds), visualRole: c.visualRole, blocksSight: c.blocksSight }))
    .filter((s) => s.box.min.z <= CAMERA.z && s.box.max.z >= CAMERA.z);

export interface Placement {
  ok: boolean;
  /** Device centre (z = 0). Present whenever a surface was found, even if placement is refused. */
  position: Vec3 | null;
  mount: CameraMount | null;
  normal: Vec3 | null;
  surfaceId: string | null;
  /** Why the placement is refused (null when ok). */
  reason: string | null;
}

const refuse = (reason: string, partial: Partial<Placement> = {}): Placement => ({ ok: false, position: null, mount: null, normal: null, surfaceId: null, ...partial, reason });

function mountFor(role: string, normal: Vec3): CameraMount | null {
  if (role === 'floor') return normal.y > 0 ? 'GROUND' : null;
  if (role === 'ceiling') return normal.y < 0 ? 'CEILING' : null;
  if (normal.y < 0) return 'CEILING';
  if (role === 'wall' || role === 'jamb') return normal.y > 0 ? 'COVER' : 'WALL';
  return 'COVER';
}

interface Candidate {
  surfaceId: string;
  mount: CameraMount;
  normal: Vec3;
  position: Vec3;
  distance: number;
}

/** Exposed surface points near `point`, nearest first. */
export function surfaceCandidates(point: { x: number; y: number }, surfaces: PlacementSurface[]): Candidate[] {
  const half = { x: CAMERA.hitSize.x / 2, y: CAMERA.hitSize.y / 2 };
  const out: Candidate[] = [];
  for (const s of surfaces) {
    const b = s.box;
    const faces: { normal: Vec3; along: 'x' | 'y'; fixed: number; lo: number; hi: number }[] = [
      { normal: { x: 0, y: 1, z: 0 }, along: 'x', fixed: b.max.y, lo: b.min.x, hi: b.max.x },
      { normal: { x: 0, y: -1, z: 0 }, along: 'x', fixed: b.min.y, lo: b.min.x, hi: b.max.x },
      { normal: { x: -1, y: 0, z: 0 }, along: 'y', fixed: b.min.x, lo: b.min.y, hi: b.max.y },
      { normal: { x: 1, y: 0, z: 0 }, along: 'y', fixed: b.max.x, lo: b.min.y, hi: b.max.y },
    ];
    for (const f of faces) {
      const mount = mountFor(s.visualRole, f.normal);
      if (!mount) continue;
      // Keep the whole device on the face when the face is big enough.
      const margin = f.along === 'x' ? half.x : half.y;
      const lo = f.hi - f.lo > 2 * margin ? f.lo + margin : (f.lo + f.hi) / 2;
      const hi = f.hi - f.lo > 2 * margin ? f.hi - margin : (f.lo + f.hi) / 2;
      const t = clamp(f.along === 'x' ? point.x : point.y, lo, hi);
      const onFace = f.along === 'x' ? { x: t, y: f.fixed } : { x: f.fixed, y: t };
      const distance = Math.hypot(onFace.x - point.x, onFace.y - point.y);
      if (distance > CAMERA.snapRadius) continue;
      const position = { x: onFace.x + f.normal.x * CAMERA.mountOffset, y: onFace.y + f.normal.y * CAMERA.mountOffset, z: CAMERA.z };
      out.push({ surfaceId: s.colliderId, mount, normal: f.normal, position, distance });
    }
  }
  // Exposed only: the device box may not sit inside any solid.
  const exposed = out.filter((c) => {
    const box = aabbFromCenterSize(c.position, CAMERA.hitSize);
    return !surfaces.some((s) => aabbOverlap(box, s.box));
  });
  return exposed.sort((a, b) => a.distance - b.distance);
}

export interface PlacementContext {
  /** Point the placement line starts from (the body's chest). */
  from: Vec3;
  surfaces: PlacementSurface[];
  /** Existing (non-destroyed) device positions. */
  occupied: Vec3[];
}

export function findPlacement(point: { x: number; y: number }, ctx: PlacementContext): Placement {
  const candidates = surfaceCandidates(point, ctx.surfaces);
  const best = candidates[0];
  if (!best) return refuse('NO SURFACE NEAR · aim at the floor, ceiling or cover');
  const partial = { position: best.position, mount: best.mount, normal: best.normal, surfaceId: best.surfaceId };
  const reach = Math.hypot(best.position.x - ctx.from.x, best.position.y - ctx.from.y, best.position.z - ctx.from.z);
  if (reach > CAMERA.placeReach) return refuse(`OUT OF REACH · ${reach.toFixed(1)} m (max ${CAMERA.placeReach.toFixed(1)})`, partial);
  for (const s of ctx.surfaces) {
    if (!s.blocksSight) continue;
    const t = segmentAabb(ctx.from, best.position, s.box);
    if (t === null || t >= 1 - 1e-6) continue;
    // Reaching onto the surface's own top, or a face turned toward the body, is fine (setting a camera on
    // the wall you hide behind). Reaching through it to its far side is not.
    if (s.colliderId === best.surfaceId) {
      const toBody = { x: ctx.from.x - best.position.x, y: ctx.from.y - best.position.y };
      if (best.normal.y > 0.5 || best.normal.x * toBody.x + best.normal.y * toBody.y > 0) continue;
    }
    return refuse(`NO CLEAR REACH · ${s.colliderId} in the way`, partial);
  }
  if (ctx.occupied.some((o) => Math.hypot(o.x - best.position.x, o.y - best.position.y) < CAMERA.minSpacing)) return refuse('SPOT TAKEN · another camera is here', partial);
  return { ok: true, ...partial, reason: null };
}

/**
 * Builds the seed of a deployed camera. Side mounts look away from their
 * surface; other mounts look the way the body faces. Pitch depends on the mount.
 */
export function deployedCameraSeed(id: string, label: string, team: Team, placement: Placement, facingX: -1 | 1): ReconCameraSeed {
  const position = placement.position!;
  const normal = placement.normal!;
  const mount = placement.mount!;
  const h = Math.abs(normal.x) > 0.5 ? Math.sign(normal.x) : facingX;
  const pitch = (CAMERA.deployPitch[mount] * Math.PI) / 180;
  const dir = { x: Math.cos(pitch) * h, y: Math.sin(pitch), z: 0 };
  return {
    id,
    label,
    team,
    mount,
    mountNormal: { ...normal },
    position: { ...position },
    lookAt: { x: position.x + dir.x * 5, y: position.y + dir.y * 5, z: position.z },
    fovDegrees: CAMERA.deployFovDegrees,
    range: CAMERA.deployRange,
  };
}
