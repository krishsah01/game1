/**
 * Observed set and immutable last-known records.
 *
 * Simulation truth (where hidden actors really are) is kept separate from
 * observed knowledge (what the player is allowed to see). A short confirmation
 * window suppresses flicker on the way IN; loss of sight is published
 * immediately so no smoothing can invent sight through a wall.
 */
import { VISIBLE_CONFIRM_TICKS } from '../shared/tuning.ts';
import type { EntityKind, Vec3 } from '../shared/types.ts';

export interface ObservationState {
  entityId: string;
  /** Consecutive ticks with at least one clear sample. */
  confirmTicks: number;
  /** Published visibility (after confirmation). */
  observed: boolean;
  /** Observer ids currently contributing. */
  sources: string[];
  lastObservedAt: number;
  lastObservedPosition: Vec3 | null;
  /** Best raw sample count this tick (developer view only). */
  rawVisibleSamples: number;
}

export interface LastKnownRecord {
  readonly id: string;
  readonly entityId: string;
  readonly kind: EntityKind;
  readonly label: string;
  readonly position: Readonly<Vec3>;
  readonly simTime: number;
}

export interface KnowledgeState {
  observations: Map<string, ObservationState>;
  lastKnown: LastKnownRecord[];
  nextRecordId: number;
}

export const createKnowledge = (): KnowledgeState => ({ observations: new Map(), lastKnown: [], nextRecordId: 1 });

export interface KnowledgeEvent {
  type: 'observed' | 'lost' | 'expired';
  entityId: string;
  sources?: string[];
  position?: Vec3;
}

/**
 * Updates one entity's observation state for this tick.
 * `sources` lists observers that currently see it; `position` is its true
 * position (used only to freeze a record at the moment sight is lost).
 */
export function updateObservation(
  k: KnowledgeState,
  entity: { id: string; kind: EntityKind; label: string },
  position: Vec3,
  sources: string[],
  rawVisibleSamples: number,
  simTime: number,
  recordLastKnown = true,
): KnowledgeEvent | null {
  let s = k.observations.get(entity.id);
  if (!s) {
    s = { entityId: entity.id, confirmTicks: 0, observed: false, sources: [], lastObservedAt: -1, lastObservedPosition: null, rawVisibleSamples: 0 };
    k.observations.set(entity.id, s);
  }
  s.rawVisibleSamples = rawVisibleSamples;
  let event: KnowledgeEvent | null = null;
  if (sources.length > 0) {
    s.confirmTicks += 1;
    s.sources = sources;
    if (!s.observed && s.confirmTicks >= VISIBLE_CONFIRM_TICKS) {
      s.observed = true;
      event = { type: 'observed', entityId: entity.id, sources };
      // Current knowledge supersedes any historical marker.
      k.lastKnown = k.lastKnown.filter((r) => r.entityId !== entity.id);
    }
    if (s.observed) {
      s.lastObservedAt = simTime;
      s.lastObservedPosition = { x: position.x, y: position.y, z: position.z };
    }
  } else {
    s.confirmTicks = 0;
    s.sources = [];
    if (s.observed) {
      s.observed = false;
      if (!recordLastKnown) return { type: 'lost', entityId: entity.id };
      const frozen = s.lastObservedPosition ?? { x: position.x, y: position.y, z: position.z };
      const record: LastKnownRecord = Object.freeze({
        id: `lk-${k.nextRecordId++}`,
        entityId: entity.id,
        kind: entity.kind,
        label: entity.label,
        position: Object.freeze({ x: frozen.x, y: frozen.y, z: frozen.z }),
        simTime: s.lastObservedAt >= 0 ? s.lastObservedAt : simTime,
      });
      k.lastKnown = [...k.lastKnown.filter((r) => r.entityId !== entity.id), record];
      event = { type: 'lost', entityId: entity.id, position: record.position };
    }
  }
  return event;
}

/** Removes records older than `maxAgeSeconds` of simulation time. */
export function expireLastKnown(k: KnowledgeState, simTime: number, maxAgeSeconds: number): LastKnownRecord[] {
  const expired = k.lastKnown.filter((r) => simTime - r.simTime > maxAgeSeconds);
  if (expired.length) k.lastKnown = k.lastKnown.filter((r) => !expired.includes(r));
  return expired;
}

export const isObserved = (k: KnowledgeState, entityId: string): boolean => k.observations.get(entityId)?.observed ?? false;
export const observedSources = (k: KnowledgeState, entityId: string): string[] => k.observations.get(entityId)?.sources ?? [];
