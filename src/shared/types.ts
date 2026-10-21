/**
 * Shared types for the concept demonstrator.
 *
 * COORDINATE CONVENTION (code axes, Three.js Y-up):
 *   X  = left/right screen travel          (+X = screen right)
 *   Y  = up/down screen height             (+Y = up, floor at y = 0)
 *   Z  = into/out of screen depth          (+Z = toward the camera = NEAR,
 *                                            -Z = into the screen  = FAR)
 *
 * The original design notes and concept board 04 call the depth axis "Y".
 * That is conceptual notation only. In this code base depth is ALWAYS Z.
 *
 * Units: metres, seconds, degrees (FOV), cycles/second (sway frequency).
 */

import type { Loadout } from './weapons.ts';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Axis-aligned box described by its centre and full size. */
export interface Bounds {
  center: Vec3;
  size: Vec3;
}

export type ScenarioKind =
  | 'HIDDEN_BATTLEFIELD'
  | 'EXPOSURE_LADDER'
  | 'CAMERA_INTEL'
  | 'LOST_CONTACT'
  | 'SMOKE_SOUND'
  | 'DEPTH_SHOT'
  | 'CONTROL_POINT'
  | 'CAMERA_WAR'
  | 'MARKSMAN';

export type EntityKind = 'PLAYER' | 'ENEMY' | 'DROPPED_GEAR' | 'CAMERA';
export type Team = 'FRIENDLY' | 'OPPOSING' | 'NEUTRAL';
export type ScriptKind = 'STATIC' | 'PATROL' | 'LOST_CONTACT_ROUTE' | 'OBJECTIVE_CONTEST';
export type CameraStatus = 'ONLINE' | 'OFFLINE' | 'JAMMED' | 'DESTROYED';
export type Stance = 'STANDING' | 'CROUCHED' | 'PRONE';
export type MoveMode = 'WALK' | 'COMBAT' | 'SPRINT';

/**
 * Gameplay collision proxy. The same seed produces the visible mesh and the
 * collider, so decorative detail can never change sightlines or collisions.
 */
export interface ColliderSeed {
  id: string;
  bounds: Bounds;
  blocksMovement: boolean;
  blocksSight: boolean;
  blocksShots: boolean;
  /** Presentation hint: 'floor' | 'wall' | 'barrier' | 'jamb' | 'crate' | 'terminal' | 'rail' ... */
  visualRole: string;
  /** True when a crouched actor may use this as waist-high or doorway cover. */
  isCover: boolean;
  /**
   * True when a standing or crouched actor may vault over it (Space). Explicit
   * flag: appearance or height alone never decides the rule. Vaultable
   * obstacles in the test map span the entire depth axis.
   */
  isVaultable: boolean;
}

export interface EntitySeed {
  id: string;
  kind: EntityKind;
  team: Team;
  label: string;
  position: Vec3;
  /** -1 faces screen-left, +1 faces screen-right. */
  facingX: -1 | 1;
  stance: Stance;
  moveMode: MoveMode;
  script: ScriptKind;
  /** Route in world metres. Interpretation depends on `script`. */
  waypoints: Vec3[];
  /** Seconds to hold at the first waypoint before a route starts. */
  holdSeconds: number;
}

export interface DepthZone {
  id: string;
  label: string;
  bounds: Bounds;
}

/** What a recon camera is fixed to. Cameras always sit on the lane plane (z = 0). */
export type CameraMount = 'WALL' | 'CEILING' | 'GROUND' | 'COVER';

export interface ReconCameraSeed {
  id: string;
  label: string;
  /** FRIENDLY cameras feed the player; OPPOSING cameras feed the opposition. */
  team: Team;
  mount: CameraMount;
  /** Outward normal of the surface the device is fixed to (unit, in the X/Y plane). */
  mountNormal: Vec3;
  /** Device position. z is always 0 (the lane plane), so a camera can be shot at depth 0. */
  position: Vec3;
  lookAt: Vec3;
  fovDegrees: number;
  range: number;
}

export interface SceneSeed {
  mapId: string;
  colliders: ColliderSeed[];
  entities: EntitySeed[];
  depthZones: DepthZone[];
  smokeBounds: Bounds;
  captureBounds: Bounds;
  /** Preplaced cameras of both teams. Deployed cameras are runtime state. */
  cameras: ReconCameraSeed[];
  /** Deployable cameras in the player's inventory at the start of the preset. */
  deployableCameras: number;
  /** Primary and sidearm the player starts with (both carried at once). */
  loadout: Loadout;
  /** Horizontal extent of the room, used by the follow camera. */
  roomMinX: number;
  roomMaxX: number;
  /** Rendering-only ambience, no gameplay meaning. */
  stationLabels: { id: string; label: string; x: number }[];
}

export interface DemoConfig {
  visionRange: number;
  visionFovDegrees: number;
  lastKnownSeconds: number;
  /** Link status of the FRIENDLY camera network (U toggles ONLINE/OFFLINE). Destroyed devices stay destroyed. */
  cameraStatus: CameraStatus;
  smokeEnabled: boolean;
  baseSwayAmplitude: number;
  swayFrequencyHz: number;
  settleSeconds: number;
  captureSeconds: number;
}

export type DemoConfigPatch = Partial<DemoConfig>;

export interface Scenario {
  id: string;
  kind: ScenarioKind;
  title: string;
  description: string;
  seed: number;
  initialScene: SceneSeed;
  defaultConfig: DemoConfig;
}

export interface ScenarioSummary {
  id: string;
  kind: ScenarioKind;
  title: string;
  description: string;
}

export interface DemoSession {
  id: string;
  scenarioId: string;
  seed: number;
  revision: number;
  config: DemoConfig;
}

export const vec3 = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
export const bounds = (cx: number, cy: number, cz: number, sx: number, sy: number, sz: number): Bounds => ({
  center: vec3(cx, cy, cz),
  size: vec3(sx, sy, sz),
});
export const cloneVec3 = (v: Vec3): Vec3 => ({ x: v.x, y: v.y, z: v.z });
