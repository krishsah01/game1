/**
 * Fixed perpendicular orthographic camera rig.
 *
 * The camera sits on +Z and looks straight along -Z. Camera position and
 * look-at share X and Y, so there is never yaw, pitch or orbit. Resizing
 * only changes the frustum extents; depth never changes projected size.
 * Horizontal follow is translation-only and clamped to the room.
 */
import { OrthographicCamera } from 'three';

export const CAMERA_DISTANCE = 30;

export function fitOrthographic(cam: OrthographicCamera, aspect: number, viewHeight: number, centerX: number, centerY: number): void {
  const halfH = viewHeight / 2;
  const halfW = halfH * Math.max(0.1, aspect);
  cam.left = -halfW;
  cam.right = halfW;
  cam.top = halfH;
  cam.bottom = -halfH;
  cam.near = 0.1;
  cam.far = CAMERA_DISTANCE + 40;
  cam.up.set(0, 1, 0);
  cam.position.set(centerX, centerY, CAMERA_DISTANCE);
  cam.lookAt(centerX, centerY, 0);
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld();
}

/** Clamped horizontal follow target: keeps the frustum inside the room when it fits. */
export function followCenterX(targetX: number, roomMinX: number, roomMaxX: number, halfWidth: number): number {
  const roomWidth = roomMaxX - roomMinX;
  if (halfWidth * 2 >= roomWidth) return (roomMinX + roomMaxX) / 2;
  return Math.min(roomMaxX - halfWidth, Math.max(roomMinX + halfWidth, targetX));
}
