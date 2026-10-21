/**
 * Resolvers with explicit validation and typed error codes.
 *
 * Error codes (GraphQLError.extensions.code):
 *   NOT_FOUND          unknown scenario or session id
 *   REVISION_CONFLICT  expectedRevision does not match (extensions.currentRevision)
 *   BAD_USER_INPUT     invalid value, out-of-range, non-finite or explicit null
 */
import { GraphQLError } from 'graphql';
import type { CameraStatus, DemoConfig, DemoConfigPatch } from '../src/shared/types.ts';
import type { SessionStore } from './store.ts';

export const API_NAME = 'milsim-concept-lab-api';
export const API_VERSION = '0.1.0';

const CAMERA_STATUSES: CameraStatus[] = ['ONLINE', 'OFFLINE', 'JAMMED', 'DESTROYED'];

interface NumericRule {
  min: number;
  max: number;
}

/** Validation ranges for DemoConfig numeric fields (units in types.ts). */
export const CONFIG_RANGES: Record<Exclude<keyof DemoConfig, 'cameraStatus' | 'smokeEnabled'>, NumericRule> = {
  visionRange: { min: 1, max: 60 },
  visionFovDegrees: { min: 10, max: 180 },
  lastKnownSeconds: { min: 0, max: 300 },
  baseSwayAmplitude: { min: 0, max: 3 },
  swayFrequencyHz: { min: 0.05, max: 5 },
  settleSeconds: { min: 0, max: 10 },
  captureSeconds: { min: 1, max: 120 },
};

const badInput = (message: string, field?: string) =>
  new GraphQLError(message, { extensions: { code: 'BAD_USER_INPUT', ...(field ? { field } : {}) } });

/**
 * Apply a patch to a config atomically: validates every field first and only
 * then returns the merged config. Explicit null is rejected rather than being
 * silently treated as "unchanged".
 */
export function applyConfigPatch(current: DemoConfig, patch: Record<string, unknown>): DemoConfig {
  const next: DemoConfig = { ...current };
  for (const [key, raw] of Object.entries(patch)) {
    if (raw === undefined) continue;
    if (raw === null) {
      throw new GraphQLError(`Field "${key}" may be omitted but not null.`, {
        extensions: { code: 'BAD_USER_INPUT', reason: 'NULL_PATCH_FIELD', field: key },
      });
    }
    if (key === 'cameraStatus') {
      if (!CAMERA_STATUSES.includes(raw as CameraStatus)) throw badInput(`Invalid cameraStatus ${String(raw)}.`, key);
      next.cameraStatus = raw as CameraStatus;
      continue;
    }
    if (key === 'smokeEnabled') {
      if (typeof raw !== 'boolean') throw badInput('smokeEnabled must be a Boolean.', key);
      next.smokeEnabled = raw;
      continue;
    }
    const rule = (CONFIG_RANGES as Record<string, NumericRule | undefined>)[key];
    if (!rule) throw badInput(`Unknown config field "${key}".`, key);
    if (typeof raw !== 'number' || !Number.isFinite(raw)) throw badInput(`${key} must be a finite number.`, key);
    if (raw < rule.min || raw > rule.max) {
      throw badInput(`${key} must be between ${rule.min} and ${rule.max} (got ${raw}).`, key);
    }
    (next as unknown as Record<string, number>)[key] = raw;
  }
  return next;
}

export function createResolvers(store: SessionStore) {
  const requireSession = (id: string) => {
    const s = store.getSession(id);
    if (!s) throw new GraphQLError(`Unknown session "${id}". It may have expired (in-memory sessions vanish on restart).`, { extensions: { code: 'NOT_FOUND', entity: 'session' } });
    return s;
  };

  const requireRevision = (expected: number, current: number) => {
    if (!Number.isInteger(expected) || expected < 1) throw badInput('expectedRevision must be a positive integer.', 'expectedRevision');
    if (expected !== current) {
      throw new GraphQLError(`Revision conflict: expected ${expected}, session is at ${current}.`, {
        extensions: { code: 'REVISION_CONFLICT', currentRevision: current, expectedRevision: expected },
      });
    }
  };

  const publicSession = (s: ReturnType<SessionStore['createSession']>) => ({
    id: s.id,
    scenarioId: s.scenarioId,
    seed: s.seed,
    revision: s.revision,
    config: s.config,
  });

  return {
    Query: {
      apiInfo: () => ({ name: API_NAME, version: API_VERSION, sessionCount: store.sessionCount(), sessionCap: store.cap }),
      scenarios: () => store.listScenarios(),
      scenario: (_: unknown, args: { id: string }) => store.getScenario(args.id) ?? null,
      session: (_: unknown, args: { id: string }) => {
        const s = store.getSession(args.id);
        return s ? publicSession(s) : null;
      },
    },
    Mutation: {
      createSession: (_: unknown, args: { scenarioId: string }) => {
        if (!store.getScenario(args.scenarioId)) {
          throw new GraphQLError(`Unknown scenario "${args.scenarioId}".`, { extensions: { code: 'NOT_FOUND', entity: 'scenario' } });
        }
        return publicSession(store.createSession(args.scenarioId));
      },
      updateConfig: (_: unknown, args: { sessionId: string; expectedRevision: number; patch: DemoConfigPatch }) => {
        const s = requireSession(args.sessionId);
        requireRevision(args.expectedRevision, s.revision);
        const next = applyConfigPatch(s.config, args.patch as Record<string, unknown>);
        return publicSession(store.commitConfig(s.id, next));
      },
      resetSession: (_: unknown, args: { sessionId: string; expectedRevision: number }) => {
        const s = requireSession(args.sessionId);
        requireRevision(args.expectedRevision, s.revision);
        return publicSession(store.resetSession(s.id));
      },
    },
  };
}
