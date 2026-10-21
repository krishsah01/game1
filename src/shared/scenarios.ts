/**
 * Authored seed data: one compact industrial training room with three
 * stations on a single floor, and seven guided presets that reposition the
 * player, actors and configuration on that shared map.
 *
 * The SAME colliders create the visible meshes and the gameplay proxies.
 *
 * Layout (world X, metres; depth is Z, floor is y = 0, lane is z = 0):
 *
 *   x -19 ........ -6 | -6 ........ 1 | 1 ........ 10 | 10 ...... 14.8 ... 21
 *   STATION A           STATION B near   STATION B far   STATION C     CONTROL A
 *   low wall + target   low wall at -3.2  camera, patrol  slot aperture capture zone
 *   (vaultable)         partition wall    bag, smoke      + target      + defender
 *                       (back-lane door)
 *
 * Vaultable obstacles (`isVaultable`) span the entire depth axis, so the only
 * way past them is over the top (Space).
 */
import type {
  Bounds,
  ColliderSeed,
  DemoConfig,
  DepthZone,
  EntitySeed,
  ReconCameraSeed,
  Scenario,
  SceneSeed,
} from './types.ts';
import { bounds, vec3 } from './types.ts';
import { DEFAULT_LOADOUT, type Loadout } from './weapons.ts';

export const MAP_ID = 'training-room-v1';

export const ROOM_MIN_X = -19;
export const ROOM_MAX_X = 21;
export const ROOM_BACK_Z = -3.0;
export const ROOM_FRONT_Z = 1.6;
export const ROOM_HEIGHT = 5;

export const BARRIER_TOP_Y = 1.1;
/** Second vaultable low wall between stations A and B. */
export const LOW_WALL_AB_X = -3.15;
export const LOW_WALL_AB_TOP_Y = 1.0;
/** Full room depth, used by obstacles that span the depth axis. */
export const ROOM_DEPTH_CENTER_Z = (ROOM_BACK_Z + ROOM_FRONT_Z) / 2;
export const ROOM_DEPTH = ROOM_FRONT_Z - ROOM_BACK_Z;
/** Slot aperture in the station-C partition, z range. */
export const SLOT_Z_MIN = -0.35;
export const SLOT_Z_MAX = 0.35;

const solid = (id: string, b: Bounds, visualRole: string, isCover = false, isVaultable = false): ColliderSeed => ({
  id,
  bounds: b,
  blocksMovement: true,
  blocksSight: true,
  blocksShots: true,
  visualRole,
  isCover,
  isVaultable,
});

function buildColliders(): ColliderSeed[] {
  const out: ColliderSeed[] = [];

  // Floor: segmented so unobserved regions can dim independently.
  for (let x = ROOM_MIN_X; x < ROOM_MAX_X; x += 4) {
    const w = Math.min(4, ROOM_MAX_X - x);
    out.push(solid(`floor-${x}`, bounds(x + w / 2, -0.15, -0.7, w, 0.3, 4.9), 'floor'));
  }
  // Back wall panels (z = -3.0 .. -3.3).
  for (let x = ROOM_MIN_X; x < ROOM_MAX_X; x += 5) {
    const w = Math.min(5, ROOM_MAX_X - x);
    out.push(solid(`backwall-${x}`, bounds(x + w / 2, ROOM_HEIGHT / 2, -3.15, w, ROOM_HEIGHT, 0.3), 'wall'));
  }
  // Ceiling slab (stops upward shots and sight; rendered as beams).
  out.push(solid('ceiling', bounds(1, ROOM_HEIGHT + 0.15, -0.7, 40, 0.3, 4.9), 'ceiling'));
  // End walls.
  out.push(solid('wall-left', bounds(ROOM_MIN_X - 0.15, ROOM_HEIGHT / 2, -0.7, 0.3, ROOM_HEIGHT, 4.9), 'wall'));
  out.push(solid('wall-right', bounds(ROOM_MAX_X + 0.15, ROOM_HEIGHT / 2, -0.7, 0.3, ROOM_HEIGHT, 4.9), 'wall'));

  // ---- Station A: exposure -------------------------------------------------
  // Waist-high concrete wall, top at y = 1.10, spanning the whole depth axis:
  // cover to hide behind, and the only way past it is to vault (Space).
  out.push(solid('barrier-a', bounds(-10, BARRIER_TOP_Y / 2, ROOM_DEPTH_CENTER_Z, 1.6, BARRIER_TOP_Y, ROOM_DEPTH), 'lowwall', true, true));
  // Fixed crates against the back wall (persistent structure, not loot).
  out.push(solid('crate-a1', bounds(-15, 0.5, -2.4, 1.2, 1.0, 1.2), 'crate'));
  out.push(solid('crate-a2', bounds(-15, 1.4, -2.4, 1.0, 0.8, 1.0), 'crate'));
  out.push(solid('locker-a', bounds(-17.6, 1.1, -2.6, 0.8, 2.2, 0.6), 'locker'));
  out.push(solid('crate-a3', bounds(-7.8, 0.45, -2.3, 1.4, 0.9, 1.2), 'crate'));

  // ---- Between A and B: a second vaultable low wall (top 1.00 m), full depth.
  out.push(solid('barrier-ab', bounds(LOW_WALL_AB_X, LOW_WALL_AB_TOP_Y / 2, ROOM_DEPTH_CENTER_Z, 0.5, LOW_WALL_AB_TOP_Y, ROOM_DEPTH), 'lowwall', true, true));

  // ---- Station B: intelligence --------------------------------------------
  // Opaque partition at x = 1 with a full-height gap at the back (z -3.0..-2.15)
  // closed above 2.2 m by a lintel: a doorway reachable only by stepping FAR.
  out.push(solid('partition-b', bounds(1, ROOM_HEIGHT / 2, -0.275, 0.4, ROOM_HEIGHT, 3.75), 'wall'));
  out.push(solid('lintel-b', bounds(1, 3.6, -2.575, 0.4, 2.8, 0.85), 'wall'));
  // Fixed crate stack in the far room; hides the lost-contact route end from CAM 01.
  out.push(solid('crate-b-tall', bounds(2.9, 1.2, -0.2, 1.0, 2.4, 1.6), 'crate'));
  out.push(solid('crate-b-low', bounds(6.2, 0.4, -2.5, 1.6, 0.8, 0.9), 'crate'));
  out.push(solid('shelf-b', bounds(-4.6, 1.2, -2.7, 1.8, 2.4, 0.5), 'shelf'));

  // ---- Station C: depth ----------------------------------------------------
  // Partition at x = 10 with a 0.7 m slot at z -0.35..0.35, 2.2 m tall.
  out.push(solid('jamb-c-far', bounds(10, ROOM_HEIGHT / 2, (ROOM_BACK_Z + SLOT_Z_MIN) / 2, 0.4, ROOM_HEIGHT, SLOT_Z_MIN - ROOM_BACK_Z), 'jamb', true));
  out.push(solid('jamb-c-near', bounds(10, ROOM_HEIGHT / 2, (SLOT_Z_MAX + ROOM_FRONT_Z) / 2, 0.4, ROOM_HEIGHT, ROOM_FRONT_Z - SLOT_Z_MAX), 'jamb', true));
  out.push(solid('lintel-c', bounds(10, 3.6, 0, 0.4, 2.8, SLOT_Z_MAX - SLOT_Z_MIN), 'jamb'));
  out.push(solid('crate-c1', bounds(12.2, 0.5, -2.4, 1.2, 1.0, 1.1), 'crate'));

  // ---- Control A ----------------------------------------------------------
  out.push({
    id: 'terminal',
    bounds: bounds(16.4, 0.6, -2.55, 0.9, 1.2, 0.5),
    blocksMovement: true,
    blocksSight: false,
    blocksShots: true,
    visualRole: 'terminal',
    isCover: false,
    isVaultable: false,
  });
  // Tall fixed crate stack at the back of the capture zone: a defender can
  // stand behind it, inside the zone, unseen from the lane.
  out.push(solid('crate-d-shield', bounds(17.4, 1.2, -2.1, 1.0, 2.4, 1.8), 'crate'));
  out.push(solid('crate-d2', bounds(20.2, 0.5, 0.6, 1.0, 1.0, 1.0), 'crate'));

  return out;
}

const depthZones: DepthZone[] = [
  {
    id: 'zone-b-door',
    label: 'DOORWAY LANE',
    bounds: bounds(1.35, 1, -1.15, 5.7, 2, 2.9), // x -1.5..4.2, z -2.6..0.3
  },
  {
    id: 'zone-c',
    label: 'APERTURE APPROACH',
    bounds: bounds(7.2, 1, 0, 4.4, 2, 2.4), // x 5.0..9.4, z -1.2..1.2
  },
  {
    id: 'zone-d',
    label: 'OBJECTIVE FLOOR',
    bounds: bounds(15.7, 1, -1.1, 3.4, 2, 3.2), // x 14.0..17.4, z -2.7..0.5
  },
];

const smokeBounds: Bounds = bounds(5.6, 1.6, -0.7, 4.0, 3.2, 4.6); // x 3.6..7.6
const captureBounds: Bounds = bounds(16.9, 1.0, -0.7, 4.2, 2.0, 4.6); // x 14.8..19.0

/** Ceiling underside (the ceiling slab spans y 5.0 .. 5.3). */
export const CEILING_Y = ROOM_HEIGHT;

/**
 * Friendly preplaced camera. Fixed to the station-B face of the station-C
 * lintel, on the lane plane (z = 0), looking back over the far room.
 */
const cam01: ReconCameraSeed = {
  id: 'cam-01',
  label: 'CAM 01',
  team: 'FRIENDLY',
  mount: 'WALL',
  mountNormal: vec3(-1, 0, 0),
  position: vec3(9.66, 3.3, 0),
  lookAt: vec3(5.0, 0.9, 0.0),
  fovDegrees: 70,
  range: 11,
};

/** Opposing camera under the ceiling between stations A and B, watching the station-A approach. */
const opforCeilingCam = (): ReconCameraSeed => ({
  id: 'cam-op1',
  label: 'OPFOR CAM',
  team: 'OPPOSING',
  mount: 'CEILING',
  mountNormal: vec3(0, -1, 0),
  position: vec3(-7.4, CEILING_Y - 0.14, 0),
  lookAt: vec3(-12.0, 0.6, 0),
  fovDegrees: 70,
  range: 11,
});

export function buildScene(entities: EntitySeed[], extra: { cameras?: ReconCameraSeed[]; deployableCameras?: number; loadout?: Loadout } = {}): SceneSeed {
  return {
    mapId: MAP_ID,
    colliders: buildColliders(),
    entities,
    depthZones,
    smokeBounds,
    captureBounds,
    cameras: [cam01, ...(extra.cameras ?? [])],
    deployableCameras: extra.deployableCameras ?? 2,
    loadout: { ...(extra.loadout ?? DEFAULT_LOADOUT) },
    roomMinX: ROOM_MIN_X,
    roomMaxX: ROOM_MAX_X,
    stationLabels: [
      { id: 'A', label: 'A / EXPOSURE', x: -10 },
      { id: 'B', label: 'B / INTELLIGENCE', x: 1 },
      { id: 'C', label: 'C / DEPTH', x: 10 },
      { id: 'D', label: 'CONTROL A', x: 16.4 },
    ],
  };
}

const player = (x: number, facingX: -1 | 1, stance: EntitySeed['stance'], z = 0): EntitySeed => ({
  id: 'player',
  kind: 'PLAYER',
  team: 'FRIENDLY',
  label: 'YOU',
  position: vec3(x, 0, z),
  facingX,
  stance,
  moveMode: 'WALK',
  script: 'STATIC',
  waypoints: [],
  holdSeconds: 0,
});

const enemyA = (): EntitySeed => ({
  id: 'enemy-a',
  kind: 'ENEMY',
  team: 'OPPOSING',
  label: 'OPFOR A',
  position: vec3(-6.2, 0, 0),
  facingX: -1,
  stance: 'STANDING',
  moveMode: 'WALK',
  script: 'STATIC',
  waypoints: [],
  holdSeconds: 0,
});

const enemyBPatrol = (moveMode: EntitySeed['moveMode'] = 'WALK'): EntitySeed => ({
  id: 'enemy-b',
  kind: 'ENEMY',
  team: 'OPPOSING',
  label: 'OPFOR B',
  position: vec3(3.8, 0, 0),
  facingX: 1,
  stance: 'STANDING',
  moveMode,
  script: 'PATROL',
  waypoints: [vec3(3.8, 0, 0), vec3(7.2, 0, 0)],
  holdSeconds: 0,
});

const enemyBStatic = (): EntitySeed => ({
  id: 'enemy-b',
  kind: 'ENEMY',
  team: 'OPPOSING',
  label: 'OPFOR B',
  position: vec3(5.2, 0, 0),
  facingX: -1,
  stance: 'STANDING',
  moveMode: 'WALK',
  script: 'STATIC',
  waypoints: [],
  holdSeconds: 0,
});

/** Holds in camera view, then walks around the tall crate into CAM 01's blind spot. */
const enemyBLostContact = (): EntitySeed => ({
  id: 'enemy-b',
  kind: 'ENEMY',
  team: 'OPPOSING',
  label: 'OPFOR B',
  position: vec3(4.6, 0, 0),
  facingX: -1,
  stance: 'STANDING',
  moveMode: 'WALK',
  script: 'LOST_CONTACT_ROUTE',
  waypoints: [vec3(4.6, 0, 0), vec3(4.2, 0, 1.1), vec3(1.8, 0, 1.1), vec3(1.8, 0, 0)],
  holdSeconds: 6,
});

const gearB = (): EntitySeed => ({
  id: 'gear-b',
  kind: 'DROPPED_GEAR',
  team: 'NEUTRAL',
  label: 'DROPPED BAG',
  position: vec3(5.6, 0, -0.9),
  facingX: 1,
  stance: 'STANDING',
  moveMode: 'WALK',
  script: 'STATIC',
  waypoints: [],
  holdSeconds: 0,
});

const enemyC = (): EntitySeed => ({
  id: 'enemy-c',
  kind: 'ENEMY',
  team: 'OPPOSING',
  label: 'OPFOR C',
  position: vec3(13.6, 0, 0),
  facingX: -1,
  stance: 'STANDING',
  moveMode: 'WALK',
  script: 'STATIC',
  waypoints: [],
  holdSeconds: 0,
});

/** Defender: waypoint 0 is outside CONTROL A, waypoint 1 is inside, behind the crate stack. */
const defenderD = (): EntitySeed => ({
  id: 'enemy-d',
  kind: 'ENEMY',
  team: 'OPPOSING',
  label: 'DEFENDER',
  position: vec3(20.0, 0, -2.3),
  facingX: -1,
  stance: 'STANDING',
  moveMode: 'COMBAT',
  script: 'OBJECTIVE_CONTEST',
  waypoints: [vec3(20.0, 0, -2.3), vec3(18.5, 0, -2.3)],
  holdSeconds: 0,
});

export const DEFAULT_CONFIG: DemoConfig = {
  visionRange: 24,
  visionFovDegrees: 100,
  lastKnownSeconds: 20,
  cameraStatus: 'OFFLINE',
  smokeEnabled: false,
  baseSwayAmplitude: 0.22,
  swayFrequencyHz: 0.45,
  settleSeconds: 1.2,
  captureSeconds: 12,
};

const withConfig = (patch: Partial<DemoConfig>): DemoConfig => ({ ...DEFAULT_CONFIG, ...patch });

export const SCENARIOS: Scenario[] = [
  {
    id: 'hidden-battlefield',
    kind: 'HIDDEN_BATTLEFIELD',
    title: '1. Hidden battlefield',
    description:
      'Static room fully readable. An enemy patrols and a bag lies behind the opaque partition; the camera is offline. Nothing dynamic is drawn where you cannot observe.',
    seed: 101,
    initialScene: buildScene([player(-2.6, 1, 'STANDING'), enemyBPatrol('WALK'), gearB()]),
    defaultConfig: withConfig({ cameraStatus: 'OFFLINE' }),
  },
  {
    id: 'exposure-ladder',
    kind: 'EXPOSURE_LADDER',
    title: '2. Exposure ladder',
    description:
      'Crouched at the barrier with a target beyond it. Step through hidden, observe and aim-over: eyes clearing cover reveal the target; muzzle clearance is a separate test.',
    seed: 102,
    initialScene: buildScene([player(-11.5, 1, 'CROUCHED'), enemyA()]),
    defaultConfig: withConfig({ cameraStatus: 'OFFLINE', baseSwayAmplitude: 0.16 }),
  },
  {
    id: 'camera-intel',
    kind: 'CAMERA_INTEL',
    title: '3. Camera intel',
    description:
      'An enemy and a dropped bag stand behind the partition. Bring CAM 01 online: another valid, occluded sight source reveals presence you cannot see yourself.',
    seed: 103,
    initialScene: buildScene([player(-2.6, 1, 'STANDING'), enemyBStatic(), gearB()]),
    defaultConfig: withConfig({ cameraStatus: 'OFFLINE' }),
  },
  {
    id: 'lost-contact',
    kind: 'LOST_CONTACT',
    title: '4. Lost contact',
    description:
      'CAM 01 reveals the enemy. Cut the link (or wait for the enemy to walk into the camera blind spot): the enemy vanishes and a stale LAST SEEN marker stays where contact was lost.',
    seed: 104,
    initialScene: buildScene([player(-2.6, 1, 'STANDING'), enemyBLostContact(), gearB()]),
    defaultConfig: withConfig({ cameraStatus: 'ONLINE', lastKnownSeconds: 25 }),
  },
  {
    id: 'smoke-sound',
    kind: 'SMOKE_SOUND',
    title: '5. Smoke and sound',
    description:
      'You and CAM 01 both watch a patrol. Toggle smoke: every visual source loses it. Change its movement mode: sound pulses hint at activity without a position.',
    seed: 105,
    initialScene: buildScene([player(8.8, -1, 'STANDING'), enemyBPatrol('COMBAT')]),
    defaultConfig: withConfig({ cameraStatus: 'ONLINE', smokeEnabled: false }),
  },
  {
    id: 'depth-shot',
    kind: 'DEPTH_SHOT',
    title: '6. Depth shot',
    description:
      'A target beyond a 0.7 m slot. The same screen aim hits, strikes the door jamb or misses in depth depending on selected depth and the predictable sway sample.',
    seed: 106,
    initialScene: buildScene([player(6.5, 1, 'STANDING'), enemyC()]),
    defaultConfig: withConfig({ cameraStatus: 'OFFLINE', baseSwayAmplitude: 0.28 }),
  },
  {
    id: 'control-point',
    kind: 'CONTROL_POINT',
    title: '7. Control point',
    description:
      'Walk into CONTROL A to capture. Send the scripted defender into the zone: progress pauses and the public CONTESTED state shows occupancy without a defender marker.',
    seed: 107,
    initialScene: buildScene([player(13.0, 1, 'STANDING'), defenderD()]),
    defaultConfig: withConfig({ cameraStatus: 'OFFLINE', captureSeconds: 10 }),
  },
  {
    id: 'camera-war',
    kind: 'CAMERA_WAR',
    title: '8. Camera war',
    description:
      'Two deployable cameras in your inventory and an OPFOR camera on the ceiling. Deploy one onto the wall (3, then click), link it with U, and shoot the enemy camera. Every camera is a dynamic object: the opposition only learns of yours through its own view cones.',
    seed: 108,
    initialScene: buildScene([player(-12.6, 1, 'STANDING'), enemyA()], { cameras: [opforCeilingCam()], deployableCameras: 2 }),
    defaultConfig: withConfig({ cameraStatus: 'OFFLINE' }),
  },
  {
    id: 'marksman',
    kind: 'MARKSMAN',
    title: '9. Marksman',
    description:
      'A DMR with a 4× scope as the primary and a pistol as the sidearm, carried together. Hold aim with the DMR: the scope pans your view further ahead. Press 2 for the pistol, 1 for the DMR again; each keeps its own magazine.',
    seed: 109,
    initialScene: buildScene([player(-18.0, 1, 'STANDING'), enemyA()], { loadout: { primary: 'DMR', sidearm: 'PISTOL' } }),
    defaultConfig: withConfig({ cameraStatus: 'OFFLINE' }),
  },
];

export const scenarioById = (id: string): Scenario | undefined => SCENARIOS.find((s) => s.id === id);
