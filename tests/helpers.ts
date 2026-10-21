import { scenarioById } from '../src/shared/scenarios.ts';
import type { DemoConfig, Scenario } from '../src/shared/types.ts';
import { emptyHeld, type HeldInput } from '../src/simulation/input.ts';
import { World } from '../src/simulation/world.ts';

export function scenario(id: string): Scenario {
  const s = scenarioById(id);
  if (!s) throw new Error(`missing scenario ${id}`);
  return s;
}

export function makeWorld(id: string, patch: Partial<DemoConfig> = {}): World {
  const s = scenario(id);
  const w = new World(s, { config: { ...s.defaultConfig, ...patch }, seed: s.seed });
  if (Object.keys(patch).length) w.applyConfig({ ...s.defaultConfig, ...patch });
  return w;
}

export function hold(w: World, patch: Partial<HeldInput>): void {
  w.setHeld({ ...emptyHeld(), ...patch });
}

/** Runs `n` fixed steps. */
export function ticks(w: World, n: number): void {
  for (let i = 0; i < n; i++) w.step();
}

/** Runs ~seconds of simulation. */
export function seconds(w: World, s: number): void {
  ticks(w, Math.round(s * 60));
}

export const observed = (w: World, id: string): boolean => w.knowledge.observations.get(id)?.observed ?? false;
export const sources = (w: World, id: string): string[] => w.knowledge.observations.get(id)?.sources ?? [];
