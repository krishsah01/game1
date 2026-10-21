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
import { aabbFromBounds, aabbFromCenterSize, type Aabb } from '../shared/geometry.ts';
import {
  ACTOR_HEIGHT,
  BODY_DEPTH,
  BODY_WIDTH,
  CROUCH_SPEED_FACTOR,
  DEPTH_SPEED,
  FIXED_STEP,
  MAGAZINE_SIZE,
  MAX_FRAME_DELTA,
  MOVE_SPEED,
  depthWord,
  type StanceAnchors,
} from '../shared/tuning.ts';
import type { Bounds, DemoConfig, DemoSession, DepthZone, EntityKind, MoveMode, Scenario, SceneSeed, Stance, Vec3 } from '../shared/types.ts';
import { applyRecoil, createAimState, currentDepthOffset, setSelectedDepth, stepSelectedDepth, updateAim, type AimState } from './aiming.ts';
import { coverCandidates, evaluateCover, type CoverCandidate, type CoverEvaluation } from './cover.ts';
import { emptyHeld, type Command, type CoverIntent, type HeldInput } from './input.ts';
import { createKnowledge, expireLastKnown, updateObservation, type KnowledgeState, type LastKnownRecord } from './knowledge.ts';
import { blockersFromColliders, moveBody, zoneAt, type MovementBlocker } from './movement.ts';
import { createNoise, playerNoiseLabel, updateNoise, type NoisePulse, type NoiseState } from './noise.ts';
import { createObjective, updateObjective, type ObjectiveState } from './objective.ts';
import { cameraFacing, cameraObserver, cameraStatusLabel, type ReconState } from './recon.ts';
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

export interface PlayerState {
  position: Vec3;
  facingX: -1 | 1;
  stance: Stance;
  moveMode: MoveMode;
  moving: boolean;
  cover: CoverEvaluation;
  braced: boolean;
  coverIntent: CoverIntent;
  zone: DepthZone | null;
  ammo: number;
  shotsFired: number;
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
  hitKind: 'collider' | 'actor' | 'none';
  hitId: string | null;
  hitLabel: string;
  /** Whether the hit actor was observed at the moment of the shot. */
  hitObserved: boolean;
  sampledOffset: number;
  test: boolean;
}

export interface LogEntry {
  simTime: number;
  text: string;
}

export interface EntityView {
  id: string;
  kind: EntityKind;
  label: string;
  position: Vec3;
  facingX: -1 | 1;
  stance: Stance;
  moving: boolean;
  observed: boolean;
  sources: string[];
  hitFlash: boolean;
  height: number;
}

export interface Presentation {
  mode: ViewMode;
  simTime: number;
  tick: number;
  paused: boolean;
  scene: SceneSeed;
  config: DemoConfig;
  player: PlayerState & { noiseLabel: string; zoneLabel: string | null; coverId: string | null };
  /** In player mode only observed entities are listed. */
  entities: EntityView[];
  lastKnown: { record: LastKnownRecord; age: number }[];
  pulses: { pulse: NoisePulse; age: number }[];
  tracers: { tracer: Tracer; age: number }[];
  objective: ObjectiveState;
  camera: { id: string; label: string; status: DemoConfig['cameraStatus']; statusLabel: string; position: Vec3; facing: Vec3; fovDegrees: number; range: number; deviceObserved: boolean };
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
  /** Omniscient information. Null in player mode. */
  dev: null | {
    playerSight: EntityObservation[];
    cameraSight: EntityObservation[];
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
  recon!: ReconState;
  knowledge!: KnowledgeState;
  aim!: AimState;
  noise!: NoiseState;
  objective!: ObjectiveState;
  tracers: Tracer[] = [];
  log: LogEntry[] = [];
  staticLit = new Map<string, number>();
  lastFiringLineTest: { result: ShotResult; simTime: number } | null = null;

  private held: HeldInput = emptyHeld();
  private accumulator = 0;
  private stepOnceRequested = false;
  private nextTracerId = 1;
  private wasMoving = false;
  private playerSight: EntityObservation[] = [];
  private cameraSight: EntityObservation[] = [];
  private observers: Observer[] = [];

  private readonly movementBlockers: MovementBlocker[];
  private readonly sightBlockers: SightBlocker[];
  private readonly staticShotTargets: ShotTarget[];
  private readonly coverCands: CoverCandidate[];

  constructor(scenario: Scenario, session: Pick<DemoSession, 'config' | 'seed'>) {
    this.scenario = scenario;
    this.scene = scenario.initialScene;
    this.config = { ...session.config };
    this.seed = session.seed;
    this.movementBlockers = blockersFromColliders(this.scene.colliders);
    this.sightBlockers = sightBlockersFromColliders(this.scene.colliders);
    this.staticShotTargets = shotTargetsFromColliders(this.scene.colliders);
    this.coverCands = coverCandidates(this.scene.colliders);
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
    this.recon = { seed: this.scene.recon, status: this.config.cameraStatus };
    this.knowledge = createKnowledge();
    this.aim = createAimState(this.seed);
    this.aim.frequencyHz = this.config.swayFrequencyHz;
    this.noise = createNoise();
    this.objective = createObjective();
    this.tracers = [];
    this.log = [];
    this.staticLit = new Map();
    this.lastFiringLineTest = null;
    this.wasMoving = false;
    this.playerSight = [];
    this.cameraSight = [];
    const position = { ...playerSeed.position };
    const cover = evaluateCover(
      { position, facingX: playerSeed.facingX, stance: playerSeed.stance, moving: false, observeHeld: false, aimHeld: false, sprinting: false },
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
      zone: zoneAt(this.scene.depthZones, position),
      ammo: MAGAZINE_SIZE,
      shotsFired: 0,
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
    this.recon.status = config.cameraStatus;
    if (prev.cameraStatus !== config.cameraStatus) this.pushLog(`CAM 01 link: ${cameraStatusLabel(config.cameraStatus)}.`);
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
        p.stance = p.stance === 'CROUCHED' ? 'STANDING' : 'CROUCHED';
        if (p.stance === 'STANDING') p.coverIntent = null;
        return null;
      case 'setStance':
        p.stance = cmd.stance;
        if (p.stance === 'STANDING') p.coverIntent = null;
        return null;
      case 'setMoveMode':
        p.moveMode = cmd.mode;
        if (cmd.mode === 'SPRINT') p.braced = false;
        return null;
      case 'fire':
        return this.fire(false);
      case 'testFiringLine':
        return this.fire(true);
      case 'reload':
        p.ammo = MAGAZINE_SIZE;
        this.pushLog('Reloaded.');
        return null;
      case 'stepDepth':
        stepSelectedDepth(this.aim, cmd.direction);
        return null;
      case 'setSelectedDepth':
        setSelectedDepth(this.aim, cmd.depth);
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
    if (held.pointerWorld) {
      const dx = held.pointerWorld.x - p.position.x;
      if (dx > FACING_HYSTERESIS) p.facingX = 1;
      else if (dx < -FACING_HYSTERESIS) p.facingX = -1;
    } else if (held.moveX !== 0) {
      p.facingX = held.moveX;
    }
    const wantsMove = held.moveX !== 0 || held.moveZ !== 0;
    if (wantsMove && p.coverIntent) p.coverIntent = null;
    const observeHeld = held.observe || p.coverIntent === 'observe';
    const aimHeld = held.aim || p.coverIntent === 'aimOver';
    const sprintMode = p.moveMode === 'SPRINT';
    const standingAim = aimHeld && p.stance === 'STANDING' && !sprintMode;

    let speed = MOVE_SPEED[p.moveMode];
    if (p.stance === 'CROUCHED') speed *= CROUCH_SPEED_FACTOR;
    if (standingAim) speed = Math.min(speed, MOVE_SPEED.WALK);
    const vx = held.moveX * speed;
    const vz = -held.moveZ * DEPTH_SPEED; // +moveZ = into the screen = -Z

    // ---- 2. movement ------------------------------------------------------
    if (dt > 0 && (vx !== 0 || vz !== 0)) {
      const result = moveBody(p.position, p.cover.anchors.height, vx, vz, dt, this.movementBlockers, this.scene.depthZones);
      p.position = result.position;
      p.lastBlockedBy = result.blockedX ?? result.blockedZ;
      p.moving = Math.abs(result.movedX) > 1e-6 || Math.abs(result.movedZ) > 1e-6;
    } else {
      p.moving = false;
      p.lastBlockedBy = null;
    }
    p.zone = zoneAt(this.scene.depthZones, p.position);
    const justStopped = this.wasMoving && !p.moving;
    this.wasMoving = p.moving;
    if (p.moving || sprintMode) p.braced = false;

    // ---- 3. cover + anchors ---------------------------------------------
    p.cover = evaluateCover(
      { position: p.position, facingX: p.facingX, stance: p.stance, moving: p.moving, observeHeld, aimHeld, sprinting: sprintMode && p.moving },
      this.coverCands,
    );
    if (!p.cover.braceable) p.braced = false;

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
    const camObserver = cameraObserver(this.recon);
    this.observers = camObserver ? [playerObserver, camObserver] : [playerObserver];
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

    // ---- 7. static readability (coarse, periodic) ----------------------
    if (this.tick % STATIC_LIT_INTERVAL === 0 || dt === 0) {
      for (const c of this.scene.colliders) {
        this.staticLit.set(c.id, staticLitFraction(c, this.observers, this.sightBlockers, smokeBox));
      }
    }

    // ---- 8. aiming -------------------------------------------------------
    updateAim(this.aim, dt, cfg, { moving: p.moving, moveMode: p.moveMode, stance: p.stance, aiming: p.cover.aiming, braced: p.braced }, justStopped);

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
    const cam = this.recon.seed;
    list.push({ id: cam.id, kind: 'CAMERA', label: cam.label, position: cam.position, samples: [{ name: 'lens', point: cam.position }] });
    return list;
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
    const eyeY = ACTOR_HEIGHT[nearest.stance] * 0.9;
    const observer: Observer = {
      id: nearest.id,
      origin: { x: nearest.position.x, y: nearest.position.y + eyeY, z: nearest.position.z },
      facing: { x: nearest.facingX, y: 0, z: 0 },
      fovDegrees: 360,
      range: 60,
    };
    const samples = actorSamples(p.position, p.cover.anchors.height);
    const obs = observeEntity(observer, { id: 'player', samples }, this.sightBlockers, smokeBox);
    p.exposure = obs.samples.map((s) => ({ name: s.name, exposed: s.reason === 'clear' }));
  }

  private sourceLabel = (id: string): string => (id === 'player' ? 'DIRECT' : this.recon.seed.label);

  private pushLog(text: string): void {
    this.log.push({ simTime: this.simTime, text });
    if (this.log.length > LOG_CAP) this.log.splice(0, this.log.length - LOG_CAP);
  }

  /** Current aim point P = (pointer.x, pointer.y, selectedDepth + depthOffset). */
  aimPoint(offset = currentDepthOffset(this.aim)): Vec3 {
    const p = this.player;
    const m = p.cover.muzzle;
    const pointer = this.held.pointerWorld;
    const x = pointer ? pointer.x : m.x + p.facingX * 20;
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
    return [...this.staticShotTargets, ...actors];
  }

  /** Resolves the firing line for the current state without side effects. */
  previewShot(): ShotResult {
    const p = this.player;
    return resolveShot(p.cover.muzzle, this.aimPoint(), this.shotTargets(), { x: p.facingX, y: 0, z: 0 });
  }

  private fire(test: boolean): ShotResult | null {
    const p = this.player;
    if (!test && p.cover.state === 'hidden') {
      this.pushLog('Blind fire is disabled in the hidden state. Observe or aim over cover first.');
      return null;
    }
    if (!test && p.ammo <= 0) {
      this.pushLog('Magazine empty. Press R to reload.');
      return null;
    }
    const offset = currentDepthOffset(this.aim);
    const result = resolveShot(p.cover.muzzle, this.aimPoint(offset), this.shotTargets(), { x: p.facingX, y: 0, z: 0 });
    if (!test) {
      p.ammo -= 1;
      p.shotsFired += 1;
      applyRecoil(this.aim);
      this.aim.lastSampledOffset = offset;
    } else {
      this.lastFiringLineTest = { result, simTime: this.simTime };
    }
    const hit = result.hit;
    const hitObserved = hit?.kind === 'actor' ? (this.knowledge.observations.get(hit.id)?.observed ?? false) : false;
    const publicEnd = hit && hit.kind === 'actor' && !hitObserved ? (result.staticHit ? result.staticHit.point : result.end) : result.end;
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
      sampledOffset: offset,
      test,
    };
    this.tracers.push(tracer);
    if (hit?.kind === 'actor' && !test) {
      const a = this.actors.find((x) => x.id === hit.id);
      if (a) a.hitFlashUntil = this.simTime + 0.25;
    }
    const where = hit ? `${hit.kind === 'actor' ? 'ACTOR' : 'COVER'} ${hit.id} at ${hit.t.toFixed(2)} m` : 'nothing within range';
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
        label: a.label,
        position: { ...a.position },
        facingX: a.facingX,
        stance: a.stance,
        moving: a.moving,
        observed,
        sources: obs?.sources ?? [],
        hitFlash: observed && this.simTime < a.hitFlashUntil,
        height: a.kind === 'DROPPED_GEAR' ? 0.5 : ACTOR_HEIGHT[a.stance],
      });
    }
    const camObs = k.observations.get(this.recon.seed.id);
    const deviceObserved = camObs?.observed ?? false;
    const offset = currentDepthOffset(this.aim);
    return {
      mode,
      simTime: this.simTime,
      tick: this.tick,
      paused: this.paused,
      scene: this.scene,
      config: this.config,
      player: {
        ...p,
        noiseLabel: playerNoiseLabel(p.moving, p.moveMode),
        zoneLabel: p.zone?.label ?? null,
        coverId: p.cover.nearCover?.id ?? null,
      },
      entities,
      lastKnown: k.lastKnown.map((record) => ({ record, age: this.simTime - record.simTime })),
      pulses: this.noise.pulses.map((pulse) => ({ pulse, age: this.simTime - pulse.simTime })),
      tracers: this.tracers.map((tracer) => ({ tracer, age: this.simTime - tracer.simTime })),
      objective: { ...this.objective },
      camera: {
        id: this.recon.seed.id,
        label: this.recon.seed.label,
        status: this.recon.status,
        statusLabel: cameraStatusLabel(this.recon.status),
        position: this.recon.seed.position,
        facing: cameraFacing(this.recon.seed),
        fovDegrees: this.recon.seed.fovDegrees,
        range: this.recon.seed.range,
        deviceObserved,
      },
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
      dev:
        mode === 'developer'
          ? {
              playerSight: this.playerSight,
              cameraSight: this.cameraSight,
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
