/**
 * Camera observation sources (v0.2.2).
 *
 * Every camera belongs to a team. A FRIENDLY camera feeds the player while the
 * friendly link (config.cameraStatus, toggled with U) is ONLINE; an OPPOSING
 * camera always feeds the opposition. A destroyed device feeds nobody.
 *
 * The device itself is a dynamic object for BOTH sides: it is drawn, and can
 * be targeted knowingly, only while some observer of that side sees it.
 */
import { aabbFromCenterSize, normalize, sub, type Aabb } from '../shared/geometry.ts';
import { CAMERA } from '../shared/tuning.ts';
import type { CameraStatus, ReconCameraSeed, Vec3 } from '../shared/types.ts';
import type { Observer } from './visibility.ts';

export interface CameraState {
  seed: ReconCameraSeed;
  /** Placed from the player's inventory during this run. */
  deployed: boolean;
  destroyed: boolean;
}

export const createCamera = (seed: ReconCameraSeed, deployed = false): CameraState => ({
  seed: { ...seed, position: { ...seed.position }, lookAt: { ...seed.lookAt }, mountNormal: { ...seed.mountNormal } },
  deployed,
  destroyed: false,
});

export const cameraFacing = (seed: ReconCameraSeed): Vec3 => normalize(sub(seed.lookAt, seed.position));

/** Effective status: destroyed beats everything; friendly devices follow the link; opposing devices are always live. */
export function cameraStatus(cam: CameraState, friendlyLink: CameraStatus): CameraStatus {
  if (cam.destroyed) return 'DESTROYED';
  return cam.seed.team === 'FRIENDLY' ? friendlyLink : 'ONLINE';
}

/** Returns an active observer only while the camera is ONLINE. Jammed/destroyed/offline contribute nothing. */
export function cameraObserver(cam: CameraState, friendlyLink: CameraStatus): Observer | null {
  if (cameraStatus(cam, friendlyLink) !== 'ONLINE') return null;
  const s = cam.seed;
  return { id: s.id, origin: s.position, facing: cameraFacing(s), fovDegrees: s.fovDegrees, range: s.range };
}

/** Shot proxy of the device. */
export const cameraHitBox = (cam: CameraState): Aabb => aabbFromCenterSize(cam.seed.position, CAMERA.hitSize);

export const cameraStatusLabel = (status: CameraStatus): string =>
  ({ ONLINE: 'LIVE', OFFLINE: 'OFFLINE', JAMMED: 'JAMMED', DESTROYED: 'DESTROYED' })[status];
