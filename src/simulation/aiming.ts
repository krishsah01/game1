/**
 * Selected depth + deterministic depth sway.
 *
 * PROPOSED DEMONSTRATOR MAPPING (not a final game decision):
 *   The mouse picks screen-space aim (world X/Y under the orthographic camera).
 *   The player explicitly selects an intended depth (world Z).
 *   A continuous, deterministic phase drives depthOffset = amplitude * sin(phase).
 *   The shot's aim point is P = (mouseX, mouseY, selectedDepth + depthOffset).
 *
 * Amplitude is a world-space offset at the aim depth, not an angular error.
 * The phase advances with simulation time only; firing never re-rolls it.
 */
import { clamp } from '../shared/geometry.ts';
import { SELECTED_DEPTH_MAX, SELECTED_DEPTH_MIN, SELECTED_DEPTH_STEP, SWAY } from '../shared/tuning.ts';
import type { DemoConfig, MoveMode, Stance } from '../shared/types.ts';

export interface AimState {
  /** Intended depth (world Z, metres). */
  selectedDepth: number;
  /** Continuous sway phase in radians. */
  swayPhase: number;
  /** Current (smoothed) amplitude in metres. */
  swayAmplitude: number;
  /** Instantaneous situational target amplitude in metres. */
  targetAmplitude: number;
  /** Current oscillation frequency, cycles/second. */
  frequencyHz: number;
  /** Recoil heat 0..SWAY.heatMax, decays over time. */
  heat: number;
  /** Seconds of settling left after the body stopped moving. */
  settleRemaining: number;
  /** Amplitude the body had when it stopped (settling blends down from it). */
  settleFromAmplitude: number;
  /** Human-readable situation label for the HUD. */
  situation: string;
  /** Depth offset sampled by the most recent shot, metres (null before any shot). */
  lastSampledOffset: number | null;
}

export const createAimState = (seed: number): AimState => ({
  selectedDepth: 0,
  // Deterministic initial phase derived from the scenario seed.
  swayPhase: ((seed % 360) * Math.PI) / 180,
  swayAmplitude: 0,
  targetAmplitude: 0,
  frequencyHz: 0.5,
  heat: 0,
  settleRemaining: 0,
  settleFromAmplitude: 0,
  situation: 'STILL',
  lastSampledOffset: null,
});

export interface AimSituation {
  moving: boolean;
  moveMode: MoveMode;
  stance: Stance;
  aiming: boolean;
  braced: boolean;
}

/** Situational amplitude before heat and settling (metres). */
export function situationalAmplitude(base: number, s: AimSituation): { amplitude: number; label: string } {
  if (s.braced && !s.moving) return { amplitude: base * SWAY.bracedFactor, label: 'BRACED' };
  let mult = SWAY.still;
  let label = 'STILL';
  if (s.moving) {
    if (s.moveMode === 'SPRINT') {
      mult = SWAY.sprint;
      label = 'SPRINTING';
    } else if (s.moveMode === 'COMBAT') {
      mult = SWAY.combat;
      label = 'COMBAT MOVE';
    } else {
      mult = SWAY.walk;
      label = 'WALKING';
    }
  }
  if (s.stance === 'CROUCHED') {
    mult *= SWAY.crouchFactor;
    label += ' / CROUCHED';
  }
  if (s.aiming && !(s.moving && s.moveMode === 'SPRINT')) {
    mult *= SWAY.aimFactor;
    label += ' / AIMING';
  }
  return { amplitude: base * mult, label };
}

export function updateAim(aim: AimState, dt: number, config: DemoConfig, s: AimSituation, justStopped: boolean): void {
  const base = config.baseSwayAmplitude;
  const situational = situationalAmplitude(base, s);
  let target = situational.amplitude;
  let label = situational.label;

  // Settling: when the body stops, blend down from the moving amplitude.
  if (justStopped) {
    aim.settleRemaining = config.settleSeconds;
    aim.settleFromAmplitude = Math.max(aim.swayAmplitude, target);
  }
  if (s.moving) aim.settleRemaining = 0;
  if (aim.settleRemaining > 0 && config.settleSeconds > 0) {
    const k = aim.settleRemaining / config.settleSeconds; // 1 → 0
    target = target + (aim.settleFromAmplitude - target) * k * k;
    label += ' / SETTLING';
    aim.settleRemaining = Math.max(0, aim.settleRemaining - dt);
  }

  // Recoil heat adds temporary instability with recovery.
  aim.heat = Math.max(0, aim.heat - SWAY.heatDecayPerSecond * dt);
  if (aim.heat > 0.01) {
    target += base * SWAY.heatFactor * aim.heat;
    label += ' / RECOIL';
  }

  aim.targetAmplitude = target;
  // Smooth amplitude changes rather than snapping (time constant ~120 ms).
  const alpha = 1 - Math.exp(-dt / 0.12);
  aim.swayAmplitude += (target - aim.swayAmplitude) * alpha;

  const targetFreq = config.swayFrequencyHz * (s.moving && s.moveMode === 'SPRINT' ? SWAY.sprintFrequencyFactor : 1);
  aim.frequencyHz += (targetFreq - aim.frequencyHz) * alpha;

  aim.swayPhase += 2 * Math.PI * aim.frequencyHz * dt;
  if (aim.swayPhase > 1e6) aim.swayPhase -= Math.floor(aim.swayPhase / (2 * Math.PI)) * 2 * Math.PI;
  aim.situation = label;
}

export const currentDepthOffset = (aim: AimState): number => aim.swayAmplitude * Math.sin(aim.swayPhase);

export function stepSelectedDepth(aim: AimState, direction: -1 | 1): void {
  aim.selectedDepth = clamp(Math.round((aim.selectedDepth + direction * SELECTED_DEPTH_STEP) / SELECTED_DEPTH_STEP) * SELECTED_DEPTH_STEP, SELECTED_DEPTH_MIN, SELECTED_DEPTH_MAX);
}

export function setSelectedDepth(aim: AimState, depth: number): void {
  if (!Number.isFinite(depth)) return;
  aim.selectedDepth = clamp(depth, SELECTED_DEPTH_MIN, SELECTED_DEPTH_MAX);
}

export function applyRecoil(aim: AimState): void {
  aim.heat = Math.min(SWAY.heatMax, aim.heat + SWAY.heatPerShot);
}
