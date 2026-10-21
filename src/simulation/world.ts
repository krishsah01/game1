/**
 * Runtime world: fixed-step update (60 Hz) over plain data.
 *
 * Three layers are kept apart on purpose:
 *   simulation truth   — every actor's real transform (needed to simulate)
 *   observed knowledge — what observation rules currently allow the player to know
 *   presentation       — a snapshot filtered by view mode; the renderer only
 *                        ever sees this, never the raw truth in player mode.
 *
 * Depth is world Z throughout (see shared/types.ts).
 */
import { aabbFromBounds, aabbFromCenterSize, add, length, rayAabb, scale, sub, type Aabb } from '../shared/geometry.ts';
import {
  ACTOR_EYE_FRACTION,
  ACTOR_HEIGHT,
  ANCHORS,
  BODY_DEPTH,
  BODY_WIDTH,
  CROUCH_SPEED_FACTOR,
  DEPTH_SPEED,
  FIXED_STEP,
  LANE_HALF_WIDTH,
  MAX_FRAME_DELTA,
  MOVE_SPEED,
  PRONE_SPEED_FACTOR,
  VAULT,
  SHOT_MAX_RANGE,
  depthWord,
  type StanceAnchors,
} from '../shared/tuning.ts';
import { WEAPONS, type Loadout, type WeaponSpec } from '../shared/weapons.ts';
import type { Bounds, CameraMount, CameraStatus, DemoConfig, DemoSession, DepthZone, EntityKind, MoveMode, Scenario, SceneSeed, Stance, Team, Vec3 } from '../shared/types.ts';
import { applyRecoil, createAimState, currentDepthOffset, setSelectedDepth, stepSelectedDepth, updateAim, type AimState } from './aiming.ts';
import { coverCandidates, evaluateCover, findVaultableAhead, type CoverCandidate, type CoverEvaluation } from './cover.ts';
import { deployedCameraSeed, findPlacement, placementSurfaces, type Placement, type PlacementSurface } from './deploy.ts';
import { emptyHeld, type Command, type CoverIntent, type DepthLane, type EquipSlot, type FirearmSlot, type HeldInput } from './input.ts';
import { createKnowledge, expireLastKnown, updateObservation, type KnowledgeState, type LastKnownRecord } from './knowledge.ts';
import { blockersFromColliders, bodyBlockedBy, depthPathBlockedBy, moveBody, zoneAt, zoneFarZ, type MovementBlocker } from './movement.ts';
import { createNoise, playerNoiseLabel, updateNoise, type NoisePulse, type NoiseState } from './noise.ts';
import { createObjective, updateObjective, type ObjectiveState } from './objective.ts';
import { cameraFacing, cameraHitBox, cameraObserver, cameraStatus, cameraStatusLabel, createCamera, type CameraState } from './recon.ts';
import { createActor, updateActor, type ActorState } from './scripts.ts';
import { resolveShot, shotTargetsFromColliders, type ShotResult, type ShotTarget } from './shots.ts';
import {
  actorSamples,
  observeEntity,
  sightBlockersFromColliders,
  staticLitFraction,
  type EntityObservation,
  type Observer,
  type SampleResult,
  type SightBlocker,
} from './visibility.ts';

export type ViewMode = 'player' | 'developer';

/** Scripted vault over an `isVaultable` obstacle: a canned move, not physics. */
export interface VaultState {
  obstacleId: string;
  fromX: number;
  toX: number;
  /** Feet height at the apex (obstacle top + hop). */
  apexY: number;
  elapsed: number;
  duration: number;
}

export interface PlayerState {
  position: Vec3;
  facingX: -1 | 1;
  stance: Stance;
  moveMode: MoveMode;
  moving: boolean;
  cover: CoverEvaluation;
  braced: boolean;
  coverIntent: CoverIntent;
  /** Inspector aim latch: behaves like holding the aim button. */
  aimLatched: boolean;
  zone: DepthZone | null;
  /** Requested depth lane: LANE (z = 0) or FAR (far edge of the current zone). */
  depthLane: DepthLane;
  /** Target z while gliding between lanes; null once settled. */
  depthTargetZ: number | null;
  /** Vault in progress, or null. */
  vault: VaultState | null;
  /** Rounds in the equipped firearm's magazine (the primary's while the camera is out). */
  ammo: number;
  shotsFired: number;
  /** Primary and sidearm, carried at the same time. */
  loadout: Loadout;
  /** Rounds left per firearm slot; each weapon keeps its own magazine. */
  magazines: Record<FirearmSlot, number>;
  /** Equipped inventory slot (1 primary, 2 sidearm, 3 camera). */
  equipped: EquipSlot;
  /** Deployable cameras left in the inventory. */
  cameraCharges: number;
  /** Where LMB would place a camera right now (camera slot equipped, pointer on the canvas), else null. */
  placement: Placement | null;
  lastBlockedBy: string | null;
  /** Which of the player's own body samples an opposing eye could see (developer readout). */
  exposure: { name: string; exposed: boolean }[];
}

export interface Tracer {
  id: number;
  simTime: number;
  origin: Vec3;
  /** True end point (developer view). */
  trueEnd: Vec3;
  /** End point safe for player view: never stops on an unobserved actor. */
  publicEnd: Vec3;
  hitKind: 'collider' | 'actor' | 'device' | 'none';
  hitId: string | null;
  hitLabel: string;
  /** Whether the hit actor was observed at the moment of the shot. */
  hitObserved: boolean;
  /** What the player may know about the outcome: the real hit, or the static obstruction beyond an unobserved actor. */
  publicKind: 'collider' | 'actor' | 'device' | 'none';
  publicId: string | null;
  publicLabel: string;
  sampledOffset: number;
  test: boolean;
}

export interface LogEntry {
  simTime: number;
  text: string;
}

/** Camera device details carried by a CAMERA entity view. */
export interface DeviceView {
  status: CameraStatus;
  mount: CameraMount;
  mountNormal: Vec3;
  facing: Vec3;
  fovDegrees: number;
  range: number;
  deployed: boolean;
}

export interface EntityView {
  id: string;
  kind: EntityKind;
  team: Team;
  label: string;
  position: Vec3;
  facingX: -1 | 1;
  stance: Stance;
  moving: boolean;
  observed: boolean;
  sources: string[];
  hitFlash: boolean;
  height: number;
  /** Present for CAMERA entities. */
  device: DeviceView | null;
}

/**
 * A camera's status record. Friendly records are player-owned UI (always
 * listed, like a link icon); they never assert that the device is currently
 * seen. Opposing records are listed in developer mode only.
 */
export interface CameraRecord {
  id: string;
  label: string;
  team: Team;
  status: CameraStatus;
  statusLabel: string;
  mount: CameraMount;
  deployed: boolean;
  position: Vec3;
  facing: Vec3;
  fovDegrees: number;
  range: number;
  /** The player side currently observes the device (drawn in the world). */
  deviceObserved: boolean;
  /** Opposing observers that currently see this device (developer mode only, else []). */
  spottedBy: string[];
}

export interface Presentation {
  mode: ViewMode;
  simTime: number;
  tick: number;
  paused: boolean;
  scene: SceneSeed;
  config: DemoConfig;
  player: PlayerState & {
    noiseLabel: string;
    zoneLabel: string | null;
    zoneFarZ: number | null;
    coverId: string | null;
    vaultProgress: number | null;
    /** Firearm in hand (the primary while the camera slot is out). */
    weapon: WeaponSpec;
    /** Aiming through a scope right now. */
    scoped: boolean;
    /** Metres the view pans ahead in the facing direction (scope look-ahead), 0 otherwise. */
    lookAhead: number;
  };
  /** In player mode only observed entities are listed. */
  entities: EntityView[];
  lastKnown: { record: LastKnownRecord; age: number }[];
  pulses: { pulse: NoisePulse; age: number }[];
  tracers: { tracer: Tracer; age: number }[];
  objective: ObjectiveState;
  /** Friendly camera link (config.cameraStatus), toggled with U. */
  cameraLink: { status: CameraStatus; statusLabel: string };
  /** Friendly status records always; opposing records in developer mode only. */
  cameras: CameraRecord[];
  smoke: { enabled: boolean; bounds: Bounds };
  aim: {
    selectedDepth: number;
    depthWord: string;
    depthOffset: number;
    amplitude: number;
    phase: number;
    situation: string;
    lastSampledOffset: number | null;
    aimPoint: Vec3 | null;
  };
  staticLit: Map<string, number>;
  /** Transient player-safe feedback line (null when expired). */
  message: string | null;
  /** Omniscient information. Null in player mode. */
  dev: null | {
    playerSight: EntityObservation[];
    cameraSight: EntityObservation[];
    /** What the opposition's eyes and cameras see of the player and the friendly cameras. */
    opforSight: EntityObservation[];
    opforObservers: Observer[];
    firingLine: ShotResult | null;
    lastFiringLineTest: { result: ShotResult; simTime: number } | null;
    log: LogEntry[];
    observers: Observer[];
    rawTruth: { id: string; position: Vec3; observed: boolean; confirmTicks: number }[];
  };
}

const STATIC_LIT_INTERVAL = 6;
const EXPOSURE_INTERVAL = 6;
const FACING_HYSTERESIS = 0.35;
const TRACER_LIFETIME = 0.6;
const LOG_CAP = 80;
const SMOOTH_RECORD_CAP = 24;
/** Label anchor height above a camera device (EntityView.height for CAMERA entities). */
const CAMERA_TAG_HEIGHT = 0.3;

export class World {
  readonly scenario: Scenario;
  readonly scene: SceneSeed;
  config: DemoConfig;
  seed: number;

  simTime = 0;
  tick = 0;
  paused = false;

  player!: PlayerState;
  actors: ActorState[] = [];
  cameras: CameraState[] = [];
  knowledge!: KnowledgeState;
  /** The opposition's own observed set (friendly cameras and the player). Never shown in player mode. */
  opforKnowledge!: KnowledgeState;
  aim!: AimState;
  noise!: NoiseState;
  objective!: ObjectiveState;
  tracers: Tracer[] = [];
  log: LogEntry[] = [];
  staticLit = new Map<string, number>();
  lastFiringLineTest: { result: ShotResult; simTime: number } | null = null;
  /** Short player-facing feedback (never reveals hidden state). */
  message: { text: string; simTime: number } | null = null;

  private held: HeldInput = emptyHeld();
  private accumulator = 0;
  private stepOnceRequested = false;
  private nextTracerId = 1;
  private wasMoving = false;
  private playerSight: EntityObservation[] = [];
  private cameraSight: EntityObservation[] = [];
  private observers: Observer[] = [];
  private opforSight: EntityObservation[] = [];
  private opforObservers: Observer[] = [];
  private deployedCount = 0;

  private readonly movementBlockers: MovementBlocker[];
  private readonly sightBlockers: SightBlocker[];
  private readonly staticShotTargets: ShotTarget[];
  private readonly coverCands: CoverCandidate[];
  private readonly placementSurfaces: PlacementSurface[];

  constructor(scenario: Scenario, session: Pick<DemoSession, 'config' | 'seed'>) {
    this.scenario = scenario;
    this.scene = scenario.initialScene;
    this.config = { ...session.config };
    this.seed = session.seed;
    this.movementBlockers = blockersFromColliders(this.scene.colliders);
    this.sightBlockers = sightBlockersFromColliders(this.scene.colliders);
    this.staticShotTargets = shotTargetsFromColliders(this.scene.colliders);
    this.coverCands = coverCandidates(this.scene.colliders);
    this.placementSurfaces = placementSurfaces(this.scene.colliders);
    this.reset();
  }

  // ------------------------------------------------------------------ lifecycle

  /** Rebuilds runtime state from the scenario seeds. Config is kept (set via applyConfig). */
  reset(): void {
    const seeds = this.scene.entities;
    const playerSeed = seeds.find((e) => e.kind === 'PLAYER');
    if (!playerSeed) throw new Error('scenario has no PLAYER entity');
    this.simTime = 0;
    this.tick = 0;
    this.accumulator = 0;
    this.paused = false;
    this.stepOnceRequested = false;
    this.held = emptyHeld();
    this.actors = seeds.filter((e) => e.kind !== 'PLAYER').map(createActor);
    this.cameras = this.scene.cameras.map((c) => createCamera(c));
    this.deployedCount = 0;
    this.knowledge = createKnowledge();
    this.opforKnowledge = createKnowledge();
    this.aim = createAimState(this.seed);
    this.aim.frequencyHz = this.config.swayFrequencyHz;
    this.noise = createNoise();
    this.objective = createObjective();
    this.tracers = [];
    this.log = [];
    this.staticLit = new Map();
    this.lastFiringLineTest = null;
    this.message = null;
    this.wasMoving = false;
    this.playerSight = [];
    this.cameraSight = [];
    this.opforSight = [];
    this.opforObservers = [];
    const position = { ...playerSeed.position };
    const loadout = { ...this.scene.loadout };
    const cover = evaluateCover(
      { position, facingX: playerSeed.facingX, stance: playerSeed.stance, moving: false, observeHeld: false, aimHeld: false, sprinting: false, aimPitch: 0, vaulting: false, weaponReach: WEAPONS[loadout.primary].reach },
      this.coverCands,
    );
    this.player = {
      position,
      facingX: playerSeed.facingX,
      stance: playerSeed.stance,
      moveMode: playerSeed.moveMode,
      moving: false,
      cover,
      braced: false,
      coverIntent: null,
      aimLatched: false,
      zone: zoneAt(this.scene.depthZones, position),
      depthLane: Math.abs(position.z) > LANE_HALF_WIDTH ? 'FAR' : 'LANE',
      depthTargetZ: null,
      vault: null,
      ammo: WEAPONS[loadout.primary].magazine,
      shotsFired: 0,
      loadout,
      magazines: { PRIMARY: WEAPONS[loadout.primary].magazine, SIDEARM: WEAPONS[loadout.sidearm].magazine },
      equipped: 'PRIMARY',
      cameraCharges: this.scene.deployableCameras,
      placement: null,
      lastBlockedBy: null,
      exposure: [],
    };
    this.pushLog(`Scenario "${this.scenario.title}" loaded (seed ${this.seed}).`);
    // Settle observation state once so the first frame is already correct.
    this.runTick(0);
  }

  applyConfig(config: DemoConfig): void {
    const prev = this.config;
    this.config = { ...config };
    if (prev.cameraStatus !== config.cameraStatus) {
      this.pushLog(`Camera link: ${cameraStatusLabel(config.cameraStatus)}.`);
      this.feedback(`CAMERA LINK · ${cameraStatusLabel(config.cameraStatus)}`);
    }
    if (prev.smokeEnabled !== config.smokeEnabled) this.pushLog(`Smoke ${config.smokeEnabled ? 'deployed' : 'cleared'}.`);
  }

  setHeld(held: HeldInput): void {
    this.held = held;
  }

  /** Clears every held input (focus loss). */
  clearHeld(): void {
    this.held = emptyHeld();
  }

  // ------------------------------------------------------------------ commands

  command(cmd: Command): ShotResult | null {
    const p = this.player;
    switch (cmd.type) {
      case 'toggleCrouch':
        if (p.vault) return null;
        // From prone, C rises to a crouch; from a crouch it stands.
        p.stance = p.stance === 'CROUCHED' ? 'STANDING' : 'CROUCHED';
        if (p.stance !== 'CROUCHED') p.coverIntent = null;
        return null;
      case 'toggleProne':
        if (p.vault) return null;
        p.stance = p.stance === 'PRONE' ? 'STANDING' : 'PRONE';
        p.coverIntent = null;
        if (p.stance === 'PRONE') p.braced = false;
        return null;
      case 'setStance':
        if (p.vault) return null;
        p.stance = cmd.stance;
        if (p.stance !== 'CROUCHED') p.coverIntent = null;
        if (p.stance === 'PRONE') p.braced = false;
        return null;
      case 'setMoveMode':
        p.moveMode = cmd.mode;
        if (cmd.mode === 'SPRINT') p.braced = false;
        return null;
      case 'cycleMoveMode': {
        const order: MoveMode[] = ['WALK', 'COMBAT', 'SPRINT'];
        p.moveMode = order[(order.indexOf(p.moveMode) + 1) % order.length]!;
        if (p.moveMode === 'SPRINT') p.braced = false;
        return null;
      }
      case 'setDepthLane':
        this.requestDepthLane(cmd.lane);
        return null;
      case 'vault':
        this.startVault();
        return null;
      case 'fire':
        if (p.equipped === 'CAMERA') {
          this.deployCamera();
          return null;
        }
        return this.fire(false);
      case 'equip':
        this.equip(cmd.slot);
        return null;
      case 'deployCamera':
        this.deployCamera(cmd.at);
        return null;
      case 'testFiringLine':
        return this.fire(true);
      case 'reload': {
        const slot = this.firearmSlot();
        p.magazines[slot] = this.weapon().magazine;
        p.ammo = p.magazines[slot];
        this.pushLog(`Reloaded ${this.weapon().label}.`);
        return null;
      }
      case 'setLoadout': {
        const spec = WEAPONS[cmd.weapon];
        if (!spec || spec.class !== cmd.slot) {
          this.feedback(`${cmd.weapon} IS NOT A ${cmd.slot}`);
          return null;
        }
        if (cmd.slot === 'PRIMARY') p.loadout.primary = cmd.weapon;
        else p.loadout.sidearm = cmd.weapon;
        p.magazines[cmd.slot] = spec.magazine;
        if (this.firearmSlot() === cmd.slot) p.ammo = spec.magazine;
        this.feedback(`${cmd.slot} · ${spec.label}`);
        this.pushLog(`Loadout: ${cmd.slot.toLowerCase()} is now ${spec.label}.`);
        return null;
      }
      case 'stepDepth':
        stepSelectedDepth(this.aim, cmd.direction);
        return null;
      case 'setSelectedDepth':
        setSelectedDepth(this.aim, cmd.depth);
        return null;
      case 'setAimLatch':
        p.aimLatched = cmd.on;
        return null;
      case 'toggleBrace':
        this.setBrace(!p.braced);
        return null;
      case 'setBrace':
        this.setBrace(cmd.on);
        return null;
      case 'setCoverIntent':
        p.coverIntent = cmd.intent;
        if (cmd.intent) p.stance = 'CROUCHED';
        return null;
      case 'setActorMoveMode': {
        const a = this.actors.find((x) => x.id === cmd.id);
        if (a) {
          a.moveMode = cmd.mode;
          this.pushLog(`${a.label} movement set to ${cmd.mode}.`);
        }
        return null;
      }
      case 'setActorDepth': {
        const a = this.actors.find((x) => x.id === cmd.id);
        if (a) {
          a.position.z = cmd.z;
          for (const w of a.waypoints) w.z = cmd.z;
          this.pushLog(`${a.label} depth set to z=${cmd.z.toFixed(2)} (${depthWord(cmd.z)}).`);
        }
        return null;
      }
      case 'setContestTarget':
        for (const a of this.actors) if (a.script === 'OBJECTIVE_CONTEST') a.contestTarget = cmd.index;
        this.pushLog(`Defender ordered ${cmd.index === 1 ? 'into' : 'out of'} CONTROL A.`);
        return null;
      case 'pause':
        this.paused = true;
        return null;
      case 'resume':
        this.paused = false;
        return null;
      case 'togglePause':
        this.paused = !this.paused;
        return null;
      case 'stepOnce':
        this.stepOnceRequested = true;
        return null;
      case 'teleportPlayer':
        p.position = { x: cmd.x, y: 0, z: cmd.z };
        p.facingX = cmd.facingX;
        p.braced = false;
        p.coverIntent = null;
        p.vault = null;
        p.depthTargetZ = null;
        p.depthLane = Math.abs(cmd.z) > LANE_HALF_WIDTH ? 'FAR' : 'LANE';
        this.pushLog(`Player moved to x=${cmd.x.toFixed(1)}.`);
        return null;
      default:
        return null;
    }
  }

  private setBrace(on: boolean): void {
    const p = this.player;
    if (!on) {
      p.braced = false;
      return;
    }
    if (p.moving) {
      this.pushLog('Cannot brace while moving.');
      return;
    }
    if (!p.cover.braceable) {
      this.pushLog('No valid cover within reach to brace on.');
      return;
    }
    if (p.moveMode === 'SPRINT') {
      this.pushLog('Cannot brace in sprint mode.');
      return;
    }
    p.braced = true;
    this.pushLog(`Braced on ${p.cover.braceable.id}.`);
  }

  /**
   * The rifle never fires from inside a solid: if the pivot→muzzle segment
   * enters a shot-blocking collider, the muzzle is pulled back to just before
   * that face (the rifle is pressed against the cover). Actors never clamp it.
   */
  private clampMuzzle(cover: CoverEvaluation): void {
    const dir = sub(cover.muzzle, cover.pivot);
    const len = length(dir);
    if (len < 1e-6) return;
    const unit = scale(dir, 1 / len);
    let nearest = len;
    for (const t of this.staticShotTargets) {
      const r = rayAabb(cover.pivot, unit, t.box, len);
      if (r && r.tEntry < nearest) nearest = r.tEntry;
    }
    if (nearest < len) {
      cover.muzzle = add(cover.pivot, scale(unit, Math.max(0, nearest - 0.03)));
      cover.muzzleClamped = true;
    }
  }

  /** Player-safe transient HUD feedback (never reveals hidden state). */
  private feedback(text: string): void {
    this.message = { text, simTime: this.simTime };
  }

  /** Public form of `feedback` for the app shell (e.g. the camera-link key). */
  notify(text: string): void {
    this.feedback(text);
  }

  /** Firearm slot in hand: the primary while the camera slot is out. */
  firearmSlot(): FirearmSlot {
    return this.player.equipped === 'CAMERA' ? 'PRIMARY' : this.player.equipped;
  }

  /** Spec of the firearm in hand. */
  weapon(): WeaponSpec {
    const p = this.player;
    return WEAPONS[this.firearmSlot() === 'PRIMARY' ? p.loadout.primary : p.loadout.sidearm];
  }

  private equip(slot: EquipSlot): void {
    const p = this.player;
    if (slot === 'CAMERA' && p.cameraCharges <= 0) {
      this.feedback('NO CAMERAS LEFT');
      return;
    }
    if (p.equipped === slot) return;
    p.equipped = slot;
    if (slot === 'CAMERA') p.braced = false;
    p.ammo = p.magazines[this.firearmSlot()];
    this.feedback(slot === 'CAMERA' ? `CAMERA ×${p.cameraCharges} · LMB to place` : this.weapon().label);
  }

  /** Chest point placement reach and line-of-reach are measured from. */
  private placementOrigin(): Vec3 {
    const p = this.player;
    return { x: p.position.x, y: p.position.y + p.cover.anchors.height * 0.6, z: p.position.z };
  }

  /** Placement for a pointer position (pure query). */
  placementAt(at: { x: number; y: number }): Placement {
    const occupied = this.cameras.filter((c) => !c.destroyed).map((c) => c.seed.position);
    return findPlacement(at, { from: this.placementOrigin(), surfaces: this.placementSurfaces, occupied });
  }

  /** Places a camera from the inventory on the snap surface nearest `at` (or the pointer). */
  private deployCamera(at?: { x: number; y: number }): void {
    const p = this.player;
    if (p.cameraCharges <= 0) {
      this.feedback('NO CAMERAS LEFT');
      return;
    }
    if (p.vault) {
      this.feedback('VAULTING · cannot place');
      return;
    }
    const point = at ?? this.held.pointerWorld;
    if (!point) {
      this.feedback('POINT AT A SURFACE TO PLACE');
      return;
    }
    const placement = this.placementAt(point);
    if (!placement.ok) {
      this.feedback(placement.reason ?? 'CANNOT PLACE HERE');
      this.pushLog(`Camera placement refused: ${placement.reason}.`);
      return;
    }
    this.deployedCount += 1;
    const index = this.cameras.filter((c) => c.seed.team === 'FRIENDLY').length + 1;
    const label = `CAM ${String(index).padStart(2, '0')}`;
    const seed = deployedCameraSeed(`cam-d${this.deployedCount}`, label, 'FRIENDLY', placement, p.facingX);
    this.cameras.push(createCamera(seed, true));
    p.cameraCharges -= 1;
    if (p.cameraCharges === 0) p.equipped = 'PRIMARY';
    const linked = this.config.cameraStatus === 'ONLINE';
    this.feedback(`${label} PLACED · ${seed.mount}${linked ? ' · LIVE' : ' · U to link'}`);
    this.pushLog(`${label} deployed on ${placement.surfaceId} (${seed.mount}) at x=${seed.position.x.toFixed(2)} y=${seed.position.y.toFixed(2)}.`);
  }

  /**
   * On/off depth move. FAR glides to the far edge of the zone the body stands
   * in; LANE glides back to z = 0. The whole path must be clear up front, so the
   * body never ends up stranded between lanes.
   */
  private requestDepthLane(lane: DepthLane): void {
    const p = this.player;
    if (p.vault) {
      this.feedback('VAULTING · depth move ignored');
      return;
    }
    const zone = p.zone ?? zoneAt(this.scene.depthZones, p.position);
    let targetZ = 0;
    if (lane === 'FAR') {
      if (!zone) {
        this.feedback('NO DEPTH ZONE HERE');
        this.pushLog('Depth move refused: the body is not inside a depth zone.');
        return;
      }
      targetZ = zoneFarZ(zone);
    }
    if (Math.abs(p.position.z - targetZ) < 1e-3) {
      p.depthLane = lane;
      p.depthTargetZ = null;
      return;
    }
    const blocker = depthPathBlockedBy(p.position, p.cover.anchors.height, targetZ, this.movementBlockers);
    if (blocker) {
      this.feedback(`DEPTH PATH BLOCKED · ${blocker}`);
      this.pushLog(`Depth move refused: ${blocker} is in the way.`);
      return;
    }
    p.depthLane = lane;
    p.depthTargetZ = targetZ;
    p.braced = false;
    p.coverIntent = null;
    this.pushLog(lane === 'FAR' ? `Depth move: to the far edge of ${zone!.label} (z ${targetZ.toFixed(2)}).` : 'Depth move: back to the lane (z 0).');
  }

  /** Vault the `isVaultable` obstacle directly ahead (standing or crouched, not prone). */
  private startVault(): void {
    const p = this.player;
    if (p.vault) return;
    if (p.stance === 'PRONE') {
      this.feedback('STAND OR CROUCH TO VAULT');
      return;
    }
    if (p.depthTargetZ !== null) {
      this.feedback('DEPTH MOVE IN PROGRESS');
      return;
    }
    const obstacle = findVaultableAhead(p.position, p.facingX, this.coverCands);
    if (!obstacle) {
      this.feedback('NOTHING TO VAULT HERE');
      this.pushLog('Vault refused: no vaultable obstacle within reach ahead.');
      return;
    }
    const f = p.facingX;
    const farFace = f > 0 ? obstacle.box.max.x : obstacle.box.min.x;
    const toX = farFace + f * (BODY_WIDTH / 2 + VAULT.clearance);
    const landingHeight = p.stance === 'CROUCHED' ? ANCHORS.crouched.height : ANCHORS.standing.height;
    const landingBlocker = bodyBlockedBy({ x: toX, y: 0, z: p.position.z }, landingHeight, this.movementBlockers);
    if (landingBlocker) {
      this.feedback(`LANDING BLOCKED · ${landingBlocker}`);
      this.pushLog(`Vault refused: landing spot blocked by ${landingBlocker}.`);
      return;
    }
    const apexY = obstacle.box.max.y + VAULT.hop;
    const apex = { x: (obstacle.box.min.x + obstacle.box.max.x) / 2, y: apexY, z: p.position.z };
    const headroomBlocker = bodyBlockedBy(apex, ANCHORS.vault.height, this.movementBlockers, obstacle.id);
    if (headroomBlocker) {
      this.feedback(`NO HEADROOM · ${headroomBlocker}`);
      this.pushLog(`Vault refused: ${headroomBlocker} leaves no headroom above ${obstacle.id}.`);
      return;
    }
    p.vault = { obstacleId: obstacle.id, fromX: p.position.x, toX, apexY, elapsed: 0, duration: VAULT.duration };
    p.braced = false;
    p.coverIntent = null;
    this.pushLog(`Vaulting ${obstacle.id} (top ${obstacle.box.max.y.toFixed(2)} m, landing x ${toX.toFixed(2)}).`);
  }

  /** Advances the scripted vault: eased travel in X, quick rise/hold/descent in Y. */
  private advanceVault(dt: number): void {
    const p = this.player;
    const v = p.vault!;
    v.elapsed = Math.min(v.duration, v.elapsed + dt);
    const t = v.elapsed / v.duration;
    const ease = t * t * (3 - 2 * t);
    const lift = Math.sin((Math.PI / 2) * Math.min(1, Math.max(0, Math.min(t / 0.3, (1 - t) / 0.3))));
    p.position = { x: v.fromX + (v.toX - v.fromX) * ease, y: v.apexY * lift, z: p.position.z };
    if (v.elapsed >= v.duration) {
      p.position = { x: v.toX, y: 0, z: p.position.z };
      p.vault = null;
      this.pushLog(`Landed beyond ${v.obstacleId}.`);
    }
  }

  // ------------------------------------------------------------------ stepping

  /** Advances by wall-clock seconds using fixed steps. Returns the number of steps run. */
  advance(elapsedSeconds: number): number {
    this.accumulator += Math.min(MAX_FRAME_DELTA, Math.max(0, elapsedSeconds));
    let steps = 0;
    while (this.accumulator >= FIXED_STEP) {
      this.accumulator -= FIXED_STEP;
      if (this.step()) steps += 1;
    }
    return steps;
  }

  /** Runs exactly one fixed step unless paused. Returns true when a tick ran. */
  step(): boolean {
    if (this.paused && !this.stepOnceRequested) return false;
    this.stepOnceRequested = false;
    this.runTick(FIXED_STEP);
    return true;
  }

  private runTick(dt: number): void {
    const p = this.player;
    const held = this.held;
    const cfg = this.config;
    if (dt > 0) {
      this.simTime += dt;
      this.tick += 1;
    }

    // ---- 1. player intent -------------------------------------------------
    const vaulting = p.vault !== null;
    if (!vaulting) {
      if (held.pointerWorld) {
        const dx = held.pointerWorld.x - p.position.x;
        if (dx > FACING_HYSTERESIS) p.facingX = 1;
        else if (dx < -FACING_HYSTERESIS) p.facingX = -1;
      } else if (held.moveX !== 0) {
        p.facingX = held.moveX;
      }
    }
    const wantsMove = held.moveX !== 0;
    if (wantsMove && p.coverIntent) p.coverIntent = null;
    const observeHeld = held.observe || p.coverIntent === 'observe';
    const aimHeld = held.aim || p.aimLatched || p.coverIntent === 'aimOver';
    const sprintMode = p.moveMode === 'SPRINT' && p.stance !== 'PRONE';
    const standingAim = aimHeld && p.stance === 'STANDING' && !sprintMode;
    // Requested aim pitch: angle from the rifle pivot to the pointer, in the facing frame.
    let aimPitch = 0;
    if (held.pointerWorld) {
      const pivot = p.cover.pivot;
      const forward = Math.max(0.05, p.facingX * (held.pointerWorld.x - pivot.x));
      aimPitch = Math.atan2(held.pointerWorld.y - pivot.y, forward);
    }

    let speed = MOVE_SPEED[p.moveMode];
    if (p.stance === 'CROUCHED') speed *= CROUCH_SPEED_FACTOR;
    else if (p.stance === 'PRONE') speed = MOVE_SPEED.WALK * PRONE_SPEED_FACTOR;
    if (standingAim) speed = Math.min(speed, MOVE_SPEED.WALK);
    const vx = vaulting ? 0 : held.moveX * speed;

    // ---- 2. movement ------------------------------------------------------
    if (vaulting) {
      if (dt > 0) this.advanceVault(dt);
      p.moving = true;
      p.lastBlockedBy = null;
    } else {
      // Depth glide toward the requested lane (on/off depth: no held axis).
      let vz = 0;
      if (p.depthTargetZ !== null && dt > 0) {
        const dz = p.depthTargetZ - p.position.z;
        vz = Math.abs(dz) <= DEPTH_SPEED * dt ? dz / dt : Math.sign(dz) * DEPTH_SPEED;
      }
      if (dt > 0 && (vx !== 0 || vz !== 0)) {
        const result = moveBody(p.position, p.cover.anchors.height, vx, vz, dt, this.movementBlockers, this.scene.depthZones);
        p.position = result.position;
        p.lastBlockedBy = result.blockedX ?? result.blockedZ;
        p.moving = Math.abs(result.movedX) > 1e-6 || Math.abs(result.movedZ) > 1e-6;
        if (p.depthTargetZ !== null) {
          if (Math.abs(p.position.z - p.depthTargetZ) < 1e-3) {
            p.position.z = p.depthTargetZ;
            p.depthTargetZ = null;
            this.pushLog(`Depth settled at z ${p.position.z.toFixed(2)} (${depthWord(p.position.z)}).`);
          } else if (result.blockedZ) {
            p.depthTargetZ = null;
            p.depthLane = Math.abs(p.position.z) <= LANE_HALF_WIDTH ? 'LANE' : 'FAR';
            this.feedback(`DEPTH PATH BLOCKED · ${result.blockedZ}`);
          }
        }
      } else {
        p.moving = false;
        p.lastBlockedBy = null;
      }
    }
    p.zone = zoneAt(this.scene.depthZones, p.position);
    const justStopped = this.wasMoving && !p.moving;
    this.wasMoving = p.moving;
    if (p.moving || sprintMode) p.braced = false;

    // ---- 3. cover + anchors ---------------------------------------------
    p.cover = evaluateCover(
      {
        position: p.position,
        facingX: p.facingX,
        stance: p.stance,
        moving: p.moving,
        observeHeld,
        aimHeld,
        sprinting: sprintMode && p.moving,
        aimPitch,
        vaulting: p.vault !== null,
        weaponReach: this.weapon().reach,
      },
      this.coverCands,
    );
    this.clampMuzzle(p.cover);
    if (!p.cover.braceable) p.braced = false;
    p.placement = p.equipped === 'CAMERA' && held.pointerWorld && !p.vault ? this.placementAt(held.pointerWorld) : null;

    // ---- 4. scripted actors --------------------------------------------
    if (dt > 0) for (const a of this.actors) updateActor(a, dt);

    // ---- 5. observers ----------------------------------------------------
    const playerObserver: Observer = {
      id: 'player',
      origin: p.cover.eye,
      facing: { x: p.facingX, y: 0, z: 0 },
      fovDegrees: cfg.visionFovDegrees,
      range: cfg.visionRange,
    };
    const camObservers = this.cameras
      .filter((c) => c.seed.team === 'FRIENDLY')
      .map((c) => cameraObserver(c, cfg.cameraStatus))
      .filter((o): o is Observer => o !== null);
    this.observers = [playerObserver, ...camObservers];
    // The opposition watches with the same rules: actor eyes plus its own live cameras.
    this.opforObservers = [
      ...this.actors.filter((a) => a.team === 'OPPOSING').map((a) => this.actorObserver(a)),
      ...this.cameras
        .filter((c) => c.seed.team === 'OPPOSING')
        .map((c) => cameraObserver(c, cfg.cameraStatus))
        .filter((o): o is Observer => o !== null),
    ];
    const smokeBox: Aabb | null = cfg.smokeEnabled ? aabbFromBounds(this.scene.smokeBounds) : null;

    // ---- 6. dynamic visibility + knowledge -----------------------------
    this.playerSight = [];
    this.cameraSight = [];
    for (const entity of this.dynamicEntities()) {
      const sources: string[] = [];
      let raw = 0;
      for (const o of this.observers) {
        if (o.id === entity.id) continue; // a sensor never observes its own device
        const obs = observeEntity(o, entity, this.sightBlockers, smokeBox);
        if (o.id === 'player') this.playerSight.push(obs);
        else this.cameraSight.push(obs);
        if (obs.observed) sources.push(o.id);
        raw = Math.max(raw, obs.visibleSamples);
      }
      // Historical markers are kept for enemy actors only (gear and gadgets simply vanish).
      const ev = updateObservation(this.knowledge, entity, entity.position, sources, raw, this.simTime, entity.kind === 'ENEMY');
      if (ev?.type === 'observed') this.pushLog(`${entity.label} observed via ${ev.sources?.map(this.sourceLabel).join(' + ')}.`);
      if (ev?.type === 'lost' && !ev.position) this.pushLog(`Contact lost: ${entity.label}.`);
      if (ev?.type === 'lost' && ev.position) this.pushLog(`Contact lost: ${entity.label}. Last known frozen at x=${ev.position!.x.toFixed(1)} z=${ev.position!.z.toFixed(1)}.`);
    }
    for (const r of expireLastKnown(this.knowledge, this.simTime, cfg.lastKnownSeconds)) this.pushLog(`Last-known marker for ${r.label} expired.`);

    // ---- 6b. what the opposition sees (player + friendly cameras) -------
    this.opforSight = [];
    for (const entity of this.opforTargets()) {
      const sources: string[] = [];
      let raw = 0;
      for (const o of this.opforObservers) {
        const obs = observeEntity(o, entity, this.sightBlockers, smokeBox);
        this.opforSight.push(obs);
        if (obs.observed) sources.push(o.id);
        raw = Math.max(raw, obs.visibleSamples);
      }
      const ev = updateObservation(this.opforKnowledge, entity, entity.position, sources, raw, this.simTime, false);
      if (ev?.type === 'observed') this.pushLog(`OPFOR spotted ${entity.label} via ${ev.sources?.map((id) => this.observerLabel(id)).join(' + ')}.`);
      if (ev?.type === 'lost') this.pushLog(`OPFOR lost sight of ${entity.label}.`);
    }

    // ---- 7. static readability (coarse, periodic) ----------------------
    if (this.tick % STATIC_LIT_INTERVAL === 0 || dt === 0) {
      for (const c of this.scene.colliders) {
        this.staticLit.set(c.id, staticLitFraction(c, this.observers, this.sightBlockers, smokeBox));
      }
    }

    // ---- 8. aiming -------------------------------------------------------
    updateAim(this.aim, dt, cfg, { moving: p.moving, moveMode: p.moveMode, stance: p.stance, aiming: p.cover.aiming, braced: p.braced, vaulting: p.vault !== null, weaponSway: this.weapon().sway }, justStopped);

    // ---- 9. noise --------------------------------------------------------
    if (dt > 0) {
      const pulse = updateNoise(this.noise, dt, this.simTime, p.position, this.actors.filter((a) => a.kind === 'ENEMY'));
      if (pulse) this.pushLog(`Noise pulse: ${pulse.mode} movement somewhere to the ${pulse.direction > 0 ? 'right' : 'left'}.`);
    }

    // ---- 10. objective ---------------------------------------------------
    const changed = updateObjective(
      this.objective,
      dt,
      this.scene.captureBounds,
      p.position,
      this.actors.filter((a) => a.team === 'OPPOSING').map((a) => a.position),
      cfg.captureSeconds,
    );
    if (changed) this.pushLog(`CONTROL A: ${changed}.`);

    // ---- 11. housekeeping ------------------------------------------------
    this.tracers = this.tracers.filter((t) => this.simTime - t.simTime < TRACER_LIFETIME);
    if (this.tick % EXPOSURE_INTERVAL === 0 || dt === 0) this.updateExposure(smokeBox);
  }

  // ------------------------------------------------------------------ helpers

  private dynamicEntities(): { id: string; kind: EntityKind; label: string; position: Vec3; samples: { name: string; point: Vec3 }[] }[] {
    const list = this.actors.map((a) => ({
      id: a.id,
      kind: a.kind,
      label: a.label,
      position: a.position,
      samples: a.kind === 'DROPPED_GEAR'
        ? [
            { name: 'top', point: { x: a.position.x, y: a.position.y + 0.5, z: a.position.z } },
            { name: 'mid', point: { x: a.position.x, y: a.position.y + 0.25, z: a.position.z } },
          ]
        : actorSamples(a.position, ACTOR_HEIGHT[a.stance]),
    }));
    for (const c of this.cameras) list.push(this.cameraTarget(c));
    return list;
  }

  /** A camera device as something to observe: one sample at the lens. */
  private cameraTarget(c: CameraState): { id: string; kind: EntityKind; label: string; position: Vec3; samples: { name: string; point: Vec3 }[] } {
    return { id: c.seed.id, kind: 'CAMERA', label: c.seed.label, position: c.seed.position, samples: [{ name: 'lens', point: c.seed.position }] };
  }

  /** What the opposition can observe: the player's body and every friendly camera device. */
  private opforTargets(): { id: string; kind: EntityKind; label: string; position: Vec3; samples: { name: string; point: Vec3 }[] }[] {
    const p = this.player;
    const samples = actorSamples(p.position, p.cover.anchors.height).map((s) =>
      s.name === 'head' && p.cover.peekLean !== 0 ? { ...s, point: { ...s.point, z: s.point.z + p.cover.peekLean } } : s,
    );
    return [{ id: 'player', kind: 'PLAYER', label: 'YOU', position: p.position, samples }, ...this.cameras.filter((c) => c.seed.team === 'FRIENDLY').map((c) => this.cameraTarget(c))];
  }

  /** An opposing actor's eye as an observer (same FOV and range rules as the player). */
  private actorObserver(a: ActorState): Observer {
    return {
      id: a.id,
      origin: { x: a.position.x, y: a.position.y + ACTOR_HEIGHT[a.stance] * ACTOR_EYE_FRACTION, z: a.position.z },
      facing: { x: a.facingX, y: 0, z: 0 },
      fovDegrees: this.config.visionFovDegrees,
      range: this.config.visionRange,
    };
  }

  private updateExposure(smokeBox: Aabb | null): void {
    const p = this.player;
    const enemies = this.actors.filter((a) => a.team === 'OPPOSING');
    if (enemies.length === 0) {
      p.exposure = [];
      return;
    }
    let nearest = enemies[0]!;
    let best = Infinity;
    for (const e of enemies) {
      const d = Math.hypot(e.position.x - p.position.x, e.position.z - p.position.z);
      if (d < best) {
        best = d;
        nearest = e;
      }
    }
    const eyeY = ACTOR_HEIGHT[nearest.stance] * ACTOR_EYE_FRACTION;
    const observer: Observer = {
      id: nearest.id,
      origin: { x: nearest.position.x, y: nearest.position.y + eyeY, z: nearest.position.z },
      facing: { x: nearest.facingX, y: 0, z: 0 },
      fovDegrees: 360,
      range: 60,
    };
    // A peek leans the head (only) around the edge of depth cover.
    const samples = actorSamples(p.position, p.cover.anchors.height).map((s) =>
      s.name === 'head' && p.cover.peekLean !== 0 ? { ...s, point: { ...s.point, z: s.point.z + p.cover.peekLean } } : s,
    );
    const obs = observeEntity(observer, { id: 'player', samples }, this.sightBlockers, smokeBox);
    p.exposure = obs.samples.map((s) => ({ name: s.name, exposed: s.reason === 'clear' }));
  }

  private sourceLabel = (id: string): string => (id === 'player' ? 'DIRECT' : (this.cameras.find((c) => c.seed.id === id)?.seed.label ?? id));

  private observerLabel = (id: string): string => this.cameras.find((c) => c.seed.id === id)?.seed.label ?? this.actors.find((a) => a.id === id)?.label ?? id;

  private pushLog(text: string): void {
    this.log.push({ simTime: this.simTime, text });
    if (this.log.length > LOG_CAP) this.log.splice(0, this.log.length - LOG_CAP);
  }

  /** Current aim point P = (pointer.x, pointer.y, selectedDepth + depthOffset). */
  aimPoint(offset = currentDepthOffset(this.aim)): Vec3 {
    const p = this.player;
    const m = p.cover.muzzle;
    const pointer = this.held.pointerWorld;
    // Without a pointer (inspector buttons) aim 5 m ahead so the depth offset is realised at a target-like distance.
    const x = pointer ? pointer.x : m.x + p.facingX * 5;
    const y = pointer ? pointer.y : m.y;
    return { x, y, z: this.aim.selectedDepth + offset };
  }

  private shotTargets(): ShotTarget[] {
    const actors: ShotTarget[] = this.actors.map((a) => ({
      kind: 'actor',
      id: a.id,
      label: a.label,
      box: a.kind === 'DROPPED_GEAR'
        ? aabbFromCenterSize({ x: a.position.x, y: a.position.y + 0.25, z: a.position.z }, { x: 0.6, y: 0.5, z: 0.45 })
        : aabbFromCenterSize({ x: a.position.x, y: a.position.y + ACTOR_HEIGHT[a.stance] / 2, z: a.position.z }, { x: BODY_WIDTH, y: ACTOR_HEIGHT[a.stance], z: BODY_DEPTH }),
    }));
    const devices: ShotTarget[] = this.cameras.filter((c) => !c.destroyed).map((c) => ({ kind: 'device', id: c.seed.id, label: c.seed.label, box: cameraHitBox(c) }));
    return [...this.staticShotTargets, ...actors, ...devices];
  }

  /** The player may know about a hit on their own team's device, or on anything they currently observe. */
  private hitIsPublic(kind: 'collider' | 'actor' | 'device', id: string): boolean {
    if (kind === 'collider') return true;
    if (kind === 'device' && this.cameras.find((c) => c.seed.id === id)?.seed.team === 'FRIENDLY') return true;
    return this.knowledge.observations.get(id)?.observed ?? false;
  }

  /** Resolves the firing line for the current state without side effects. */
  previewShot(): ShotResult {
    const p = this.player;
    return resolveShot(p.cover.muzzle, this.aimPoint(), this.shotTargets(), { x: p.facingX, y: 0, z: 0 });
  }

  private fire(test: boolean): ShotResult | null {
    const p = this.player;
    if (!test && p.vault) {
      this.pushLog('Cannot fire while vaulting.');
      this.feedback('VAULTING · cannot fire');
      return null;
    }
    if (!test && !p.cover.aiming) {
      this.pushLog('Cannot fire from low ready. Hold the aim button first.');
      this.feedback('LOW READY · hold right mouse to aim');
      return null;
    }
    if (!test && p.cover.state === 'hidden') {
      this.pushLog('Blind fire is disabled in the hidden state. Observe or aim over cover first.');
      this.message = { text: 'BLIND FIRE DISABLED · observe or aim over', simTime: this.simTime };
      return null;
    }
    if (!test && p.ammo <= 0) {
      this.pushLog('Magazine empty. Press R to reload.');
      this.message = { text: 'EMPTY · R to reload', simTime: this.simTime };
      return null;
    }
    const offset = currentDepthOffset(this.aim);
    const result = resolveShot(p.cover.muzzle, this.aimPoint(offset), this.shotTargets(), { x: p.facingX, y: 0, z: 0 });
    if (!test) {
      const slot = this.firearmSlot();
      p.magazines[slot] -= 1;
      p.ammo = p.magazines[slot];
      p.shotsFired += 1;
      applyRecoil(this.aim, this.weapon().heatPerShot);
      this.aim.lastSampledOffset = offset;
    } else {
      this.lastFiringLineTest = { result, simTime: this.simTime };
    }
    const hit = result.hit;
    const hitObserved = hit && hit.kind !== 'collider' ? this.hitIsPublic(hit.kind, hit.id) : false;
    const hiddenActor = hit !== null && hit.kind !== 'collider' && !hitObserved;
    // The player may only learn what a shot would have told them without the hidden body on the line.
    const publicHit = hiddenActor ? result.staticHit : hit;
    const publicEnd = hiddenActor ? (result.staticHit ? result.staticHit.point : add(result.origin, scale(result.direction, SHOT_MAX_RANGE))) : result.end;
    const tracer: Tracer = {
      id: this.nextTracerId++,
      simTime: this.simTime,
      origin: result.origin,
      trueEnd: result.end,
      publicEnd,
      hitKind: hit ? hit.kind : 'none',
      hitId: hit ? hit.id : null,
      hitLabel: hit ? hit.label : 'no hit within range',
      hitObserved,
      publicKind: publicHit ? publicHit.kind : 'none',
      publicId: publicHit ? publicHit.id : null,
      publicLabel: publicHit ? publicHit.label : 'no hit within range',
      sampledOffset: offset,
      test,
    };
    this.tracers.push(tracer);
    if (hit?.kind === 'actor' && !test) {
      const a = this.actors.find((x) => x.id === hit.id);
      if (a) a.hitFlashUntil = this.simTime + 0.25;
    }
    if (hit?.kind === 'device' && !test) {
      const cam = this.cameras.find((c) => c.seed.id === hit.id);
      if (cam && !cam.destroyed) {
        cam.destroyed = true;
        this.pushLog(`${cam.seed.label} (${cam.seed.team}) destroyed by a shot.`);
      }
    }
    // Feedback is derived from the public outcome so an unseen body never changes what the player sees.
    if (test) this.message = { text: publicHit ? `FIRING LINE · ${publicHit.kind !== 'collider' ? 'clear to target' : `blocked by ${publicHit.label}`}` : 'FIRING LINE · clear', simTime: this.simTime };
    else if (publicHit?.kind === 'actor') this.message = { text: 'HIT', simTime: this.simTime };
    else if (publicHit?.kind === 'device') this.message = { text: `CAMERA DESTROYED · ${publicHit.label}`, simTime: this.simTime };
    else if (publicHit?.kind === 'collider') this.message = { text: `IMPACT · ${publicHit.label}`, simTime: this.simTime };
    const where = hit ? `${hit.kind === 'actor' ? 'ACTOR' : hit.kind === 'device' ? 'DEVICE' : 'COVER'} ${hit.id} at ${hit.t.toFixed(2)} m` : 'nothing within range';
    this.pushLog(`${test ? 'Firing-line test' : 'Shot'} [${p.cover.state}] depth ${this.aim.selectedDepth.toFixed(2)}${offset >= 0 ? '+' : ''}${offset.toFixed(2)} → ${where}.`);
    return result;
  }

  // ------------------------------------------------------------------ presentation

  snapshot(mode: ViewMode): Presentation {
    const p = this.player;
    const k = this.knowledge;
    const entities: EntityView[] = [];
    for (const a of this.actors) {
      const obs = k.observations.get(a.id);
      const observed = obs?.observed ?? false;
      if (mode === 'player' && !observed) continue;
      entities.push({
        id: a.id,
        kind: a.kind,
        team: a.team,
        label: a.label,
        position: { ...a.position },
        facingX: a.facingX,
        stance: a.stance,
        moving: a.moving,
        observed,
        sources: obs?.sources ?? [],
        hitFlash: observed && this.simTime < a.hitFlashUntil,
        height: a.kind === 'DROPPED_GEAR' ? 0.5 : ACTOR_HEIGHT[a.stance],
        device: null,
      });
    }
    // Camera devices are dynamic objects for both teams: drawn only while observed.
    const cameras: CameraRecord[] = [];
    for (const c of this.cameras) {
      const obs = k.observations.get(c.seed.id);
      const observed = obs?.observed ?? false;
      const status = cameraStatus(c, this.config.cameraStatus);
      const facing = cameraFacing(c.seed);
      if (mode === 'developer' || observed) {
        entities.push({
          id: c.seed.id,
          kind: 'CAMERA',
          team: c.seed.team,
          label: c.seed.label,
          position: { ...c.seed.position },
          facingX: facing.x >= 0 ? 1 : -1,
          stance: 'STANDING',
          moving: false,
          observed,
          sources: obs?.sources ?? [],
          hitFlash: false,
          height: CAMERA_TAG_HEIGHT,
          device: { status, mount: c.seed.mount, mountNormal: { ...c.seed.mountNormal }, facing, fovDegrees: c.seed.fovDegrees, range: c.seed.range, deployed: c.deployed },
        });
      }
      if (mode === 'developer' || c.seed.team === 'FRIENDLY') {
        cameras.push({
          id: c.seed.id,
          label: c.seed.label,
          team: c.seed.team,
          status,
          statusLabel: cameraStatusLabel(status),
          mount: c.seed.mount,
          deployed: c.deployed,
          position: { ...c.seed.position },
          facing,
          fovDegrees: c.seed.fovDegrees,
          range: c.seed.range,
          deviceObserved: observed,
          spottedBy: mode === 'developer' ? (this.opforKnowledge.observations.get(c.seed.id)?.observed ? (this.opforKnowledge.observations.get(c.seed.id)?.sources ?? []) : []) : [],
        });
      }
    }
    const offset = currentDepthOffset(this.aim);
    const scoped = p.cover.aiming && p.equipped !== 'CAMERA' && this.weapon().scope !== null;
    return {
      mode,
      simTime: this.simTime,
      tick: this.tick,
      paused: this.paused,
      scene: this.scene,
      config: this.config,
      player: {
        ...p,
        // Exposure is computed from an opposing eye and is developer information.
        exposure: mode === 'developer' ? p.exposure : [],
        noiseLabel: playerNoiseLabel(p.moving && !p.vault, p.moveMode),
        zoneLabel: p.zone?.label ?? null,
        zoneFarZ: p.zone ? zoneFarZ(p.zone) : null,
        coverId: p.cover.nearCover?.id ?? null,
        vaultProgress: p.vault ? p.vault.elapsed / p.vault.duration : null,
        weapon: this.weapon(),
        scoped,
        lookAhead: scoped ? this.weapon().scope!.lookAhead : 0,
      },
      entities,
      lastKnown: k.lastKnown.map((record) => ({ record, age: this.simTime - record.simTime })),
      pulses: this.noise.pulses.map((pulse) => ({ pulse, age: this.simTime - pulse.simTime })),
      tracers: this.tracers.map((tracer) => ({
        // Player mode only ever carries the public outcome of a shot.
        tracer: mode === 'developer' ? tracer : { ...tracer, trueEnd: tracer.publicEnd, hitKind: tracer.publicKind, hitId: tracer.publicId, hitLabel: tracer.publicLabel },
        age: this.simTime - tracer.simTime,
      })),
      objective: { ...this.objective },
      cameraLink: { status: this.config.cameraStatus, statusLabel: cameraStatusLabel(this.config.cameraStatus) },
      cameras,
      smoke: { enabled: this.config.smokeEnabled, bounds: this.scene.smokeBounds },
      aim: {
        selectedDepth: this.aim.selectedDepth,
        depthWord: depthWord(this.aim.selectedDepth),
        depthOffset: offset,
        amplitude: this.aim.swayAmplitude,
        phase: this.aim.swayPhase,
        situation: this.aim.situation,
        lastSampledOffset: this.aim.lastSampledOffset,
        aimPoint: mode === 'developer' ? this.aimPoint(offset) : null,
      },
      staticLit: this.staticLit,
      message: this.message && this.simTime - this.message.simTime < 2.5 ? this.message.text : null,
      dev:
        mode === 'developer'
          ? {
              playerSight: this.playerSight,
              cameraSight: this.cameraSight,
              opforSight: this.opforSight,
              opforObservers: this.opforObservers,
              firingLine: this.previewShot(),
              lastFiringLineTest: this.lastFiringLineTest,
              log: this.log.slice(-SMOOTH_RECORD_CAP),
              observers: this.observers,
              rawTruth: this.actors.map((a) => ({ id: a.id, position: { ...a.position }, observed: k.observations.get(a.id)?.observed ?? false, confirmTicks: k.observations.get(a.id)?.confirmTicks ?? 0 })),
            }
          : null,
    };
  }

  /** Developer-only accessor used by tests. */
  sampleResultsFor(entityId: string): SampleResult[] {
    return this.playerSight.find((o) => o.entityId === entityId)?.samples ?? [];
  }

  anchorsFor(): StanceAnchors {
    return this.player.cover.anchors;
  }
}
