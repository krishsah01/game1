/**
 * Illustrative capture behaviour for CONTROL A (proposed communication model,
 * not a final ruleset).
 *
 * Progress advances only while the attacker is inside the zone and no
 * defender is inside it. A defender inside pauses progress and shows the
 * public CONTESTED state (this intentionally reveals occupancy, not where the
 * defender is). Leaving the zone pauses progress.
 */
import { pointInBounds } from '../shared/geometry.ts';
import type { Bounds, Vec3 } from '../shared/types.ts';

export type ObjectiveStatus = 'IDLE' | 'CAPTURING' | 'CONTESTED' | 'PAUSED' | 'SECURED';

export interface ObjectiveState {
  progress: number;
  status: ObjectiveStatus;
  attackerInside: boolean;
  defendersInside: number;
}

export const createObjective = (): ObjectiveState => ({ progress: 0, status: 'IDLE', attackerInside: false, defendersInside: 0 });

const bodyPoint = (feet: Vec3): Vec3 => ({ x: feet.x, y: feet.y + 0.9, z: feet.z });

export function updateObjective(o: ObjectiveState, dt: number, zone: Bounds, attackerFeet: Vec3, defenderFeet: Vec3[], captureSeconds: number): ObjectiveStatus | null {
  const before = o.status;
  o.attackerInside = pointInBounds(bodyPoint(attackerFeet), zone);
  o.defendersInside = defenderFeet.filter((d) => pointInBounds(bodyPoint(d), zone)).length;
  if (o.status !== 'SECURED') {
    if (o.attackerInside && o.defendersInside === 0) {
      o.status = 'CAPTURING';
      o.progress = Math.min(1, o.progress + dt / Math.max(0.1, captureSeconds));
      if (o.progress >= 1) o.status = 'SECURED';
    } else if (o.attackerInside) {
      o.status = 'CONTESTED';
    } else {
      o.status = o.progress > 0 ? 'PAUSED' : 'IDLE';
    }
  }
  return o.status !== before ? o.status : null;
}
