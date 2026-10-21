/**
 * Coarse audio information. A pulse says "something moved roughly over
 * there" with a loudness tied to the mover's speed tier. It never encodes a
 * precise position, distance, identity or outline, and pulses are rate
 * limited.
 */
import { HEARING_RANGE, NOISE, NOISE_PULSE_LIFETIME, NOISE_PULSE_MIN_GAP } from '../shared/tuning.ts';
import type { MoveMode, Vec3 } from '../shared/types.ts';
import type { ActorState } from './scripts.ts';

export interface NoisePulse {
  id: number;
  simTime: number;
  /** -1 = somewhere to the left, +1 = somewhere to the right. */
  direction: -1 | 1;
  /** 0..1 loudness bucket derived from the mover's move mode. */
  loudness: number;
  mode: MoveMode;
}

export interface NoiseState {
  pulses: NoisePulse[];
  lastPulseAt: number;
  nextId: number;
}

export const createNoise = (): NoiseState => ({ pulses: [], lastPulseAt: -Infinity, nextId: 1 });

export function updateNoise(state: NoiseState, dt: number, simTime: number, listener: Vec3, movers: ActorState[]): NoisePulse | null {
  state.pulses = state.pulses.filter((p) => simTime - p.simTime < NOISE_PULSE_LIFETIME);
  let emitted: NoisePulse | null = null;
  for (const a of movers) {
    if (!a.moving) {
      a.noiseClock = 0;
      continue;
    }
    a.noiseClock += dt;
    const profile = NOISE[a.moveMode];
    if (a.noiseClock < profile.interval) continue;
    a.noiseClock = 0;
    const dx = a.position.x - listener.x;
    const dz = a.position.z - listener.z;
    if (Math.hypot(dx, dz) > HEARING_RANGE) continue;
    if (simTime - state.lastPulseAt < NOISE_PULSE_MIN_GAP) continue;
    const pulse: NoisePulse = { id: state.nextId++, simTime, direction: dx >= 0 ? 1 : -1, loudness: profile.loudness, mode: a.moveMode };
    state.pulses.push(pulse);
    state.lastPulseAt = simTime;
    emitted = pulse;
  }
  return emitted;
}

export const playerNoiseLabel = (moving: boolean, mode: MoveMode): string => (moving ? NOISE[mode].label : 'SILENT');
