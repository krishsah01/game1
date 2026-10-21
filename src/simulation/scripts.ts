/**
 * Deterministic scripted actors. Routes are authored to avoid geometry, so
 * scripted actors do not collide (documented simplification). They restart
 * exactly with the preset.
 */
import { MOVE_SPEED } from '../shared/tuning.ts';
import type { EntitySeed, MoveMode, Stance, Vec3 } from '../shared/types.ts';

export interface ActorState {
  id: string;
  kind: EntitySeed['kind'];
  team: EntitySeed['team'];
  label: string;
  position: Vec3;
  facingX: -1 | 1;
  stance: Stance;
  moveMode: MoveMode;
  script: EntitySeed['script'];
  waypoints: Vec3[];
  holdSeconds: number;
  /** Runtime: current target waypoint index. */
  routeIndex: number;
  /** Runtime: seconds spent holding. */
  holdElapsed: number;
  /** Runtime: route finished (LOST_CONTACT_ROUTE). */
  routeDone: boolean;
  moving: boolean;
  /** Objective-contest target waypoint (0 = outside, 1 = inside). */
  contestTarget: 0 | 1;
  /** Seconds since last noise pulse. */
  noiseClock: number;
  /** Set when a shot hits this actor (presentation flash). */
  hitFlashUntil: number;
}

export function createActor(seed: EntitySeed): ActorState {
  return {
    id: seed.id,
    kind: seed.kind,
    team: seed.team,
    label: seed.label,
    position: { ...seed.position },
    facingX: seed.facingX,
    stance: seed.stance,
    moveMode: seed.moveMode,
    script: seed.script,
    waypoints: seed.waypoints.map((w) => ({ ...w })),
    holdSeconds: seed.holdSeconds,
    routeIndex: 0,
    holdElapsed: 0,
    routeDone: false,
    moving: false,
    contestTarget: 0,
    noiseClock: 0,
    hitFlashUntil: -1,
  };
}

/** Moves toward target; returns true when reached. */
function stepToward(actor: ActorState, target: Vec3, dt: number): boolean {
  const speed = MOVE_SPEED[actor.moveMode];
  const dx = target.x - actor.position.x;
  const dz = target.z - actor.position.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 1e-4) {
    actor.moving = false;
    return true;
  }
  const stepLen = speed * dt;
  if (Math.abs(dx) > 0.02) actor.facingX = dx > 0 ? 1 : -1;
  if (stepLen >= dist) {
    actor.position.x = target.x;
    actor.position.z = target.z;
    actor.moving = true;
    return true;
  }
  actor.position.x += (dx / dist) * stepLen;
  actor.position.z += (dz / dist) * stepLen;
  actor.moving = true;
  return false;
}

export function updateActor(actor: ActorState, dt: number): void {
  switch (actor.script) {
    case 'STATIC':
      actor.moving = false;
      return;
    case 'PATROL': {
      if (actor.waypoints.length < 2) {
        actor.moving = false;
        return;
      }
      const target = actor.waypoints[actor.routeIndex]!;
      if (stepToward(actor, target, dt)) actor.routeIndex = (actor.routeIndex + 1) % actor.waypoints.length;
      return;
    }
    case 'LOST_CONTACT_ROUTE': {
      if (actor.routeDone || actor.waypoints.length === 0) {
        actor.moving = false;
        return;
      }
      if (actor.holdElapsed < actor.holdSeconds) {
        actor.holdElapsed += dt;
        actor.moving = false;
        return;
      }
      const target = actor.waypoints[actor.routeIndex]!;
      if (stepToward(actor, target, dt)) {
        if (actor.routeIndex >= actor.waypoints.length - 1) {
          actor.routeDone = true;
          actor.moving = false;
        } else actor.routeIndex += 1;
      }
      return;
    }
    case 'OBJECTIVE_CONTEST': {
      const target = actor.waypoints[actor.contestTarget];
      if (!target) {
        actor.moving = false;
        return;
      }
      stepToward(actor, target, dt);
      return;
    }
    default:
      actor.moving = false;
  }
}
