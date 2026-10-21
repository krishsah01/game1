/**
 * In-memory scenario catalogue and session store.
 * Sessions vanish on restart by design (no persistence requirement).
 * A simple cap evicts the least recently used session.
 */
import { SCENARIOS, scenarioById } from '../src/shared/scenarios.ts';
import type { DemoConfig, DemoSession, Scenario } from '../src/shared/types.ts';

export const SESSION_CAP = 64;

export interface StoredSession extends DemoSession {
  createdAt: number;
  touchedAt: number;
}

export interface SessionStore {
  readonly cap: number;
  listScenarios(): Scenario[];
  getScenario(id: string): Scenario | undefined;
  getSession(id: string): StoredSession | undefined;
  createSession(scenarioId: string): StoredSession;
  commitConfig(sessionId: string, config: DemoConfig): StoredSession;
  resetSession(sessionId: string): StoredSession;
  sessionCount(): number;
}

export function createStore(options: { now?: () => number; cap?: number; idPrefix?: string } = {}): SessionStore {
  const now = options.now ?? (() => Date.now());
  const cap = options.cap ?? SESSION_CAP;
  const idPrefix = options.idPrefix ?? 'sess';
  const sessions = new Map<string, StoredSession>();
  let counter = 0;

  const touch = (s: StoredSession) => {
    s.touchedAt = now();
    // Re-insert so Map iteration order doubles as an LRU order.
    sessions.delete(s.id);
    sessions.set(s.id, s);
    return s;
  };

  const evict = () => {
    while (sessions.size > cap) {
      const oldest = sessions.keys().next().value;
      if (oldest === undefined) break;
      sessions.delete(oldest);
    }
  };

  return {
    cap,
    listScenarios: () => SCENARIOS,
    getScenario: (id) => scenarioById(id),
    getSession: (id) => {
      const s = sessions.get(id);
      return s ? touch(s) : undefined;
    },
    createSession: (scenarioId) => {
      const scenario = scenarioById(scenarioId);
      if (!scenario) throw new Error(`unknown scenario ${scenarioId}`);
      counter += 1;
      const t = now();
      const s: StoredSession = {
        id: `${idPrefix}-${t.toString(36)}-${counter.toString(36)}`,
        scenarioId,
        seed: scenario.seed,
        revision: 1,
        config: { ...scenario.defaultConfig },
        createdAt: t,
        touchedAt: t,
      };
      sessions.set(s.id, s);
      evict();
      return s;
    },
    commitConfig: (sessionId, config) => {
      const s = sessions.get(sessionId);
      if (!s) throw new Error(`unknown session ${sessionId}`);
      s.config = { ...config };
      s.revision += 1;
      return touch(s);
    },
    resetSession: (sessionId) => {
      const s = sessions.get(sessionId);
      if (!s) throw new Error(`unknown session ${sessionId}`);
      const scenario = scenarioById(s.scenarioId);
      if (!scenario) throw new Error(`unknown scenario ${s.scenarioId}`);
      s.config = { ...scenario.defaultConfig };
      s.seed = scenario.seed;
      s.revision += 1;
      return touch(s);
    },
    sessionCount: () => sessions.size,
  };
}
