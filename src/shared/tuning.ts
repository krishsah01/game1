/**
 * Tunable demo defaults. Everything here is a reversible prototype value.
 * Geometry in metres, time in seconds. Depth is world Z (see types.ts).
 */
import type { MoveMode, Stance } from './types.ts';

/** Fixed simulation step (60 Hz). */
export const FIXED_STEP = 1 / 60;
/** Clamp on catch-up after tab suspension. */
export const MAX_FRAME_DELTA = 0.1;

/** Player collider footprint (also used for the prone proxy: a documented simplification). */
export const BODY_WIDTH = 0.5;
export const BODY_DEPTH = 0.5;

/** Half-width of the default travel lane around z = 0 (metres). */
export const LANE_HALF_WIDTH = 0.3;
/**
 * Glide speed of the on/off depth move. Depth is binary: W glides the body to
 * the far edge of the depth zone it stands in, S glides it back to the lane.
 */
export const DEPTH_SPEED = 3.5;

/** Horizontal speed per move mode (metres/second). */
export const MOVE_SPEED: Record<MoveMode, number> = {
  WALK: 1.6,
  COMBAT: 2.6,
  SPRINT: 4.6,
};
export const CROUCH_SPEED_FACTOR = 0.6;
/** Prone crawl: fraction of WALK speed, whatever tier is selected. */
export const PRONE_SPEED_FACTOR = 0.3;

/**
 * Mechanical stance anchors (metres above the feet).
 * Eye = sight origin. Muzzle = firing origin. Height = collider height.
 * Pivot = rear hand / shoulder the rifle swings around when the arms follow
 * the aim point; at zero pitch the muzzle sits exactly at (muzzleForward, muzzleY).
 * The barrier top in the test map is 1.10 m.
 */
export interface StanceAnchors {
  eyeY: number;
  muzzleY: number;
  height: number;
  /** Forward offset of the eye from the body centre (in facing direction). */
  eyeForward: number;
  /** Forward offset of the muzzle from the body centre (in facing direction). */
  muzzleForward: number;
  /** Forward offset of the rifle pivot from the body centre. */
  pivotForward: number;
  /** Height of the rifle pivot above the feet. */
  pivotY: number;
}

export type CoverState = 'none' | 'hidden' | 'observe' | 'aimOver' | 'peek';

export const ANCHORS = {
  standing: { eyeY: 1.62, muzzleY: 1.38, height: 1.8, eyeForward: 0.12, muzzleForward: 0.62, pivotForward: 0.0, pivotY: 1.34 },
  standingAim: { eyeY: 1.6, muzzleY: 1.42, height: 1.8, eyeForward: 0.12, muzzleForward: 0.62, pivotForward: 0.0, pivotY: 1.34 },
  crouched: { eyeY: 0.98, muzzleY: 0.8, height: 1.06, eyeForward: 0.14, muzzleForward: 0.58, pivotForward: 0.0, pivotY: 0.72 },
  observe: { eyeY: 1.24, muzzleY: 0.86, height: 1.4, eyeForward: 0.14, muzzleForward: 0.58, pivotForward: 0.0, pivotY: 0.9 },
  aimOver: { eyeY: 1.36, muzzleY: 1.24, height: 1.6, eyeForward: 0.14, muzzleForward: 0.6, pivotForward: 0.0, pivotY: 1.1 },
  /**
   * Lying along the facing direction. The 0.5 m collider footprint covers the
   * head and shoulders (the eye stays inside it); the legs trail behind and
   * are visual only. The rifle is out in front.
   */
  prone: { eyeY: 0.42, muzzleY: 0.34, height: 0.5, eyeForward: 0.2, muzzleForward: 0.85, pivotForward: 0.15, pivotY: 0.3 },
  /** Tucked body while going over an obstacle; rifle lowered. */
  vault: { eyeY: 1.3, muzzleY: 1.0, height: 1.4, eyeForward: 0.14, muzzleForward: 0.5, pivotForward: 0.0, pivotY: 1.0 },
} satisfies Record<string, StanceAnchors>;

/**
 * How far the arms may swing the rifle toward the aim point, in degrees above
 * (up) and below (down) level. Prone cannot aim steeply.
 */
export const AIM_PITCH_LIMITS: Record<Stance, { up: number; down: number }> = {
  STANDING: { up: 70, down: 70 },
  CROUCHED: { up: 65, down: 60 },
  PRONE: { up: 25, down: 8 },
};

/** Waist-high cover is recognised when its top is inside this band. */
export const COVER_TOP_MIN = 0.8;
export const COVER_TOP_MAX = 1.45;
/** Cover must be this close in front of the body (gap between faces). */
export const COVER_REACH = 0.75;
/** Any cover collider within reach can be braced on. */
export const BRACE_REACH = 0.75;
/** Extra depth tolerance for bracing: a door jamb beside the slot still counts. */
export const BRACE_Z_SLACK = 0.45;

/**
 * Depth-cover peek (hold F). Off the lane, with full-height cover directly
 * ahead, the head leans toward the lane until the eye clears the cover's
 * lane-side edge by `clearance`. Cover whose edge needs a longer lean than
 * `maxLean` is not depth cover. The body and the rifle stay put.
 */
export const PEEK = {
  clearance: 0.1,
  maxLean: 1.0,
};

/** Vault (Space): go over an `isVaultable` obstacle directly ahead. */
export const VAULT = {
  /** Obstacle top must be inside this band (metres). */
  topMin: 0.5,
  topMax: 1.3,
  /** Gap between the body front and the obstacle face. */
  reach: 0.8,
  /** Seconds the scripted move takes. */
  duration: 0.7,
  /** Landing distance beyond the far face (plus half the body width). */
  clearance: 0.3,
  /** Feet clear the obstacle top by this much at the apex. */
  hop: 0.15,
};

/** Body sample heights (fraction of collider height) used for observation tests. */
export const BODY_SAMPLES = [
  { name: 'head', fraction: 0.92 },
  { name: 'chest', fraction: 0.66 },
  { name: 'pelvis', fraction: 0.5 },
] as const;

/** Enemy actor collider heights per stance. */
export const ACTOR_HEIGHT: Record<Stance, number> = { STANDING: 1.8, CROUCHED: 1.06, PRONE: 0.5 };

/** Visibility: an entity is observed once this many samples are clear. */
export const VISIBLE_SAMPLE_THRESHOLD = 1;
/** Confirmation ticks before a newly visible entity is published (anti-flicker). */
export const VISIBLE_CONFIRM_TICKS = 3;

/** Sway multipliers relative to baseSwayAmplitude. */
export const SWAY = {
  still: 1.0,
  walk: 1.9,
  combat: 2.6,
  sprint: 4.0,
  /** Going over an obstacle: no aim control at all. */
  vault: 3.2,
  crouchFactor: 0.7,
  proneFactor: 0.4,
  aimFactor: 0.5,
  bracedFactor: 0.22,
  /** Added amplitude per recoil heat unit (multiplier of base). */
  heatFactor: 1.6,
  heatPerShot: 0.35,
  heatMax: 1.4,
  heatDecayPerSecond: 0.7,
  sprintFrequencyFactor: 1.6,
};

export const SELECTED_DEPTH_MIN = -1.5;
export const SELECTED_DEPTH_MAX = 1.0;
export const SELECTED_DEPTH_STEP = 0.25;

export const SHOT_MAX_RANGE = 60;
export const MAGAZINE_SIZE = 24;

/** Noise pulses: seconds between pulses per move mode, and relative loudness. */
export const NOISE: Record<MoveMode, { interval: number; loudness: number; label: string }> = {
  WALK: { interval: 1.7, loudness: 0.35, label: 'QUIET' },
  COMBAT: { interval: 1.0, loudness: 0.65, label: 'MODERATE' },
  SPRINT: { interval: 0.55, loudness: 1.0, label: 'LOUD' },
};
export const HEARING_RANGE = 16;
export const NOISE_PULSE_MIN_GAP = 0.45;
export const NOISE_PULSE_LIFETIME = 1.1;

export const depthWord = (z: number): 'NEAR' | 'MID' | 'FAR' => (z > 0.3 ? 'NEAR' : z < -0.3 ? 'FAR' : 'MID');
