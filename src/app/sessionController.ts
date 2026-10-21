/**
 * Owns API state (scenario, session, config), the running World and the
 * rules that keep them consistent:
 *   - scenario switches create a new session and a new World;
 *   - each switch bumps an epoch; late responses from an earlier epoch are
 *     discarded so a stale preset can never overwrite the current one;
 *   - configuration mutations are serialised and carry the expected revision;
 *     a revision conflict re-reads the session once and retries;
 *   - API loss after a session exists never stops the local simulation.
 *
 * Plain TypeScript (no React) so it can be unit-tested in Node.
 */
import { ApiClient, GraphQLClientError } from '../graphql/client.ts';
import type { DemoConfig, DemoConfigPatch, DemoSession, Scenario, ScenarioSummary } from '../shared/types.ts';
import { World } from '../simulation/world.ts';

export type ApiPhase = 'idle' | 'loading' | 'ready' | 'error';

export interface ControllerState {
  phase: ApiPhase;
  epoch: number;
  scenarios: ScenarioSummary[];
  scenario: Scenario | null;
  session: DemoSession | null;
  error: string | null;
  /** True while the API is unreachable but a local world keeps running. */
  disconnected: boolean;
  /** True while updateConfig/resetSession is in flight (controls disable). */
  mutating: boolean;
  transportLabel: string;
  transportKind: 'http' | 'inprocess';
}

export class SessionController {
  world: World | null = null;
  private state: ControllerState;
  private listeners = new Set<() => void>();
  private mutationQueue: Promise<unknown> = Promise.resolve();
  private abort: AbortController | null = null;
  /** Called after a world is created or reset so the renderer can rebuild. */
  onWorldReplaced: ((world: World) => void) | null = null;

  constructor(public client: ApiClient) {
    this.state = {
      phase: 'idle',
      epoch: 0,
      scenarios: [],
      scenario: null,
      session: null,
      error: null,
      disconnected: false,
      mutating: false,
      transportLabel: client.transport.label,
      transportKind: client.transport.kind,
    };
  }

  getState(): ControllerState {
    return this.state;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private set(patch: Partial<ControllerState>): void {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l();
  }

  /** Loads the scenario catalogue. */
  async loadCatalogue(): Promise<void> {
    try {
      const scenarios = await this.client.scenarios();
      this.set({ scenarios, disconnected: false, error: this.state.scenario ? this.state.error : null });
    } catch (err) {
      this.set({ error: describe(err), disconnected: true, phase: this.state.scenario ? this.state.phase : 'error' });
      throw err;
    }
  }

  /**
   * Selects a scenario: fetches its seed, creates a session and builds a
   * fresh World. Any response belonging to an older selection is ignored.
   */
  async selectScenario(id: string): Promise<void> {
    const epoch = this.state.epoch + 1;
    this.abort?.abort();
    const abort = new AbortController();
    this.abort = abort;
    // A new epoch abandons any in-flight mutation of the old one, so its `mutating` flag must not survive.
    this.set({ phase: 'loading', epoch, error: null, mutating: false });
    try {
      const [scenario, session] = await Promise.all([this.client.scenario(id, abort.signal), this.client.createSession(id, abort.signal)]);
      if (this.state.epoch !== epoch) return; // stale: a newer selection won
      if (session.scenarioId !== scenario.id) throw new GraphQLClientError('Server returned a session for a different scenario.', 'SCENARIO_MISMATCH');
      this.world = new World(scenario, session);
      this.set({ phase: 'ready', scenario, session, disconnected: false, error: null });
      this.onWorldReplaced?.(this.world);
    } catch (err) {
      if (this.state.epoch !== epoch) return;
      this.set({ phase: 'error', error: describe(err), disconnected: err instanceof GraphQLClientError && err.transport });
    }
  }

  /** Serialised configuration mutation with one automatic retry on revision conflict. */
  updateConfig(patch: DemoConfigPatch): Promise<DemoSession | null> {
    const epoch = this.state.epoch;
    const task = async (): Promise<DemoSession | null> => {
      const session = this.state.session;
      if (!session || this.state.epoch !== epoch) return null;
      this.set({ mutating: true });
      try {
        let next: DemoSession;
        try {
          next = await this.client.updateConfig(session.id, session.revision, patch);
        } catch (err) {
          if (err instanceof GraphQLClientError && err.code === 'REVISION_CONFLICT') {
            const fresh = await this.client.session(session.id);
            if (!fresh) throw err;
            next = await this.client.updateConfig(fresh.id, fresh.revision, patch);
          } else throw err;
        }
        if (this.state.epoch !== epoch) return null;
        this.applySession(next);
        return next;
      } catch (err) {
        if (this.state.epoch === epoch) this.set({ error: describe(err), disconnected: err instanceof GraphQLClientError && err.transport });
        throw err;
      } finally {
        if (this.state.epoch === epoch) this.set({ mutating: false });
      }
    };
    const run = this.mutationQueue.then(task, task);
    this.mutationQueue = run.catch(() => undefined);
    return run;
  }

  /** Server-side reset (defaults + new revision) followed by a local rebuild. */
  reset(): Promise<DemoSession | null> {
    const epoch = this.state.epoch;
    const task = async (): Promise<DemoSession | null> => {
      const session = this.state.session;
      if (!session || this.state.epoch !== epoch) return null;
      this.set({ mutating: true });
      try {
        let next: DemoSession;
        try {
          next = await this.client.resetSession(session.id, session.revision);
        } catch (err) {
          if (err instanceof GraphQLClientError && err.code === 'REVISION_CONFLICT') {
            const fresh = await this.client.session(session.id);
            if (!fresh) throw err;
            next = await this.client.resetSession(fresh.id, fresh.revision);
          } else throw err;
        }
        if (this.state.epoch !== epoch) return null;
        this.applySession(next, true);
        return next;
      } catch (err) {
        if (this.state.epoch === epoch) this.set({ error: describe(err), disconnected: err instanceof GraphQLClientError && err.transport });
        throw err;
      } finally {
        if (this.state.epoch === epoch) this.set({ mutating: false });
      }
    };
    const run = this.mutationQueue.then(task, task);
    this.mutationQueue = run.catch(() => undefined);
    return run;
  }

  /**
   * U key: toggles the friendly camera link ONLINE ⇄ OFFLINE through the same
   * updateConfig mutation the inspector uses. A jammed or destroyed link cannot
   * be activated from the field. If the API is unreachable the change is applied
   * locally so the key still works (the session catches up on the next mutation).
   */
  async toggleCameraLink(): Promise<DemoSession | null> {
    const world = this.world;
    if (!world) return null;
    const current = world.config.cameraStatus;
    if (current === 'JAMMED' || current === 'DESTROYED') {
      world.notify(`CAMERA LINK ${current} · cannot activate`);
      return null;
    }
    const next = current === 'ONLINE' ? 'OFFLINE' : 'ONLINE';
    if (next === 'ONLINE' && !world.cameras.some((c) => c.seed.team === 'FRIENDLY' && !c.destroyed)) {
      world.notify('NO CAMERAS TO LINK');
      return null;
    }
    if (!this.state.session) {
      world.applyConfig({ ...world.config, cameraStatus: next });
      return null;
    }
    try {
      return await this.updateConfig({ cameraStatus: next });
    } catch {
      if (this.world === world) world.applyConfig({ ...world.config, cameraStatus: next });
      return null;
    }
  }

  /** Local-only reset used when the API is unreachable: rebuilds from the cached seed and last known config. */
  resetLocally(): void {
    if (!this.world) return;
    this.world.reset();
    this.onWorldReplaced?.(this.world);
  }

  /** Clears the error banner without changing the session. */
  dismissError(): void {
    this.set({ error: null });
  }

  private applySession(session: DemoSession, rebuild = false): void {
    this.set({ session, disconnected: false, error: null });
    if (this.world) {
      this.world.applyConfig(session.config as DemoConfig);
      this.world.seed = session.seed;
      if (rebuild) {
        this.world.reset();
        this.onWorldReplaced?.(this.world);
      }
    }
  }
}

function describe(err: unknown): string {
  if (err instanceof GraphQLClientError) return `${err.code}: ${err.message}`;
  if (err instanceof Error) return err.message;
  return String(err);
}
