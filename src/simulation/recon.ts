/**
 * Camera observation source. The observer-source interface is extensible
 * (drones, sensors, teammates would be further sources) but only one
 * preplaced camera is implemented in this build.
 */
import { normalize, sub } from '../shared/geometry.ts';
import type { CameraStatus, ReconCameraSeed, Vec3 } from '../shared/types.ts';
import type { Observer } from './visibility.ts';

export interface ReconState {
  seed: ReconCameraSeed;
  status: CameraStatus;
}

export const cameraFacing = (seed: ReconCameraSeed): Vec3 => normalize(sub(seed.lookAt, seed.position));

/** Returns an active observer only while the link is ONLINE. Jammed/destroyed/offline contribute nothing. */
export function cameraObserver(recon: ReconState): Observer | null {
  if (recon.status !== 'ONLINE') return null;
  return { id: recon.seed.id, origin: recon.seed.position, facing: cameraFacing(recon.seed), fovDegrees: recon.seed.fovDegrees, range: recon.seed.range };
}

export const cameraStatusLabel = (status: CameraStatus): string =>
  ({ ONLINE: 'LIVE', OFFLINE: 'OFFLINE', JAMMED: 'JAMMED', DESTROYED: 'DESTROYED' })[status];
