/**
 * Tunable demo defaults. Everything here is a reversible prototype value.
 * Geometry in metres, time in seconds. Depth is world Z (see types.ts).
 */
import type { MoveMode } from './types.ts';

/** Fixed simulation step (60 Hz). */
export const FIXED_STEP = 1 / 60;
/** Clamp on catch-up after tab suspension. */
export const MAX_FRAME_DELTA = 0.1;

/** Player collider footprint. */
export const BODY_WIDTH = 0.5;
export const BODY_DEPTH = 0.5;

/** Half-width of the default travel lane around z = 0 (metres). */
export const LANE_HALF_WIDTH = 0.3;
/** Depth movement speed inside a contextual depth zone. */
export const DEPTH_SPEED = 1.3;

/** Horizontal speed per move mode (metres/second). */
export const MOVE_SPEED: Record<MoveMode, number> = {
  WALK: 1.6,
  COMBAT: 2.6,
  SPRINT: 4.6,
};
export const CROUCH_SPEED_FACTOR = 0.6;

/**
 * Mechanical stance anchors (metres above the feet).
 * Eye = sight origin. Muzzle = firing origin. Height = collider height.
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
}

export type CoverState = 'none' | 'hidden' | 'observe' | 'aimOver';

export const ANCHORS = {
  standing: { eyeY: 1.62, muzzleY: 1.38, height: 1.8, eyeForward: 0.12, muzzleForward: 0.62 },
  standingAim: { eyeY: 1.6, muzzleY: 1.42, height: 1.8, eyeForward: 0.12, muzzleForward: 0.62 },
  crouched: { eyeY: 0.98, muzzleY: 0.92, height: 1.06, eyeForward: 0.14, muzzleForward: 0.58 },
  observe: { eyeY: 1.24, muzzleY: 0.95, height: 1.4, eyeForward: 0.14, muzzleForward: 0.58 },
  aimOver: { eyeY: 1.36, muzzleY: 1.24, height: 1.6, eyeForward: 0.14, muzzleForward: 0.6 },
} satisfies Record<string, StanceAnchors>;

/** Waist-high cover is recognised when its top is inside this band. */
export const COVER_TOP_MIN = 0.8;
export const COVER_TOP_MAX = 1.45;
/** Cover must be this close in front of the body (gap between faces). */
export const COVER_REACH = 0.75;
/** Any cover collider within reach can be braced on. */
export const BRACE_REACH = 0.75;
/** Extra depth tolerance for bracing: a door jamb beside the slot still counts. */
export const BRACE_Z_SLACK = 0.45;

/** Body sample heights (fraction of collider height) used for observation tests. */
export const BODY_SAMPLES = [
  { name: 'head', fraction: 0.92 },
  { name: 'chest', fraction: 0.66 },
  { name: 'pelvis', fraction: 0.5 },
] as const;

/** Enemy actor collider heights per stance. */
export const ACTOR_HEIGHT = { STANDING: 1.8, CROUCHED: 1.06 } as const;

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
  crouchFactor: 0.7,
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
