import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ScenarioKind } from '../shared/types.ts';
import type { ViewMode } from '../simulation/world.ts';
import { Gallery } from './Gallery.tsx';
import { Help } from './Help.tsx';
import { useControllerState, useHudSnapshot } from './hooks.ts';
import { Hud } from './Hud.tsx';
import { Inspector } from './Inspector.tsx';
import { SceneCanvas, type DevOptions } from './SceneCanvas.tsx';
import { SessionController } from './sessionController.ts';
import { TopView } from './TopView.tsx';
import { Tour, TOUR_HINTS } from './Tour.tsx';
import { chooseTransport, type TransportChoice } from './transportSetup.ts';

export function App() {
  const [choice, setChoice] = useState<TransportChoice | null>(null);
  const [booting, setBooting] = useState(true);
  const booted = useRef(false);

  const boot = useCallback(async (forceInProcess = false) => {
    setBooting(true);
    const c = await chooseTransport(forceInProcess);
    setChoice(c);
    setBooting(false);
  }, []);

  useEffect(() => {
    // StrictMode mounts twice in development; probe the API once.
    if (booted.current) return;
    booted.current = true;
    void boot();
  }, [boot]);

  if (booting || !choice) {
    return (
      <div className="boot">
        <div className="boot-card">
          <h1>SIDE-SCROLLER MILSIM / CONCEPT LAB</h1>
          <p className="muted">Probing the GraphQL endpoint…</p>
        </div>
      </div>
    );
  }
  if (choice.probeError && !choice.autoFallback) {
    return (
      <div className="boot">
        <div className="boot-card">
          <h1>SIDE-SCROLLER MILSIM / CONCEPT LAB</h1>
          <p className="error">GraphQL endpoint not reachable: {choice.probeError}</p>
          <p className="muted small">
            Start the API with <code>npm run dev</code> (it runs the GraphQL Yoga server on 127.0.0.1:4000 and proxies /graphql). Or continue with the in-process demo, which executes the same schema inside the browser.
          </p>
          <div className="btn-row">
            <button className="primary" onClick={() => void boot(false)}>
              Retry HTTP
            </button>
            <button onClick={() => void boot(true)}>Use in-process demo</button>
          </div>
        </div>
      </div>
    );
  }
  return <Lab key={choice.client.transport.kind} choice={choice} />;
}

function Lab({ choice }: { choice: TransportChoice }) {
  const controller = useMemo(() => new SessionController(choice.client), [choice]);
  const state = useControllerState(controller);
  const [mode, setMode] = useState<ViewMode>('player');
  const [devOptions, setDevOptions] = useState<DevOptions>({ showRays: true, showColliders: false, showCones: true, showZones: true });
  const [help, setHelp] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(() => typeof window === 'undefined' || window.innerWidth >= 1500);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [tour, setTour] = useState<{ active: boolean; index: number }>({ active: false, index: 0 });
  const p = useHudSnapshot(controller, mode);
  const helpRef = useRef(help);
  helpRef.current = help;

  const initialised = useRef(false);
  useEffect(() => {
    if (initialised.current) return; // StrictMode double-mount guard: one catalogue load, one session
    initialised.current = true;
    void controller.loadCatalogue().then(() => controller.selectScenario('hidden-battlefield')).catch(() => undefined);
  }, [controller]);

  /** Retries whatever failed: the catalogue if it never loaded, otherwise the current (or first) scenario. */
  const retry = useCallback(async () => {
    const s = controller.getState();
    try {
      if (s.scenarios.length === 0) await controller.loadCatalogue();
    } catch {
      return;
    }
    const target = s.scenario?.id ?? controller.getState().scenarios[0]?.id;
    if (target) await controller.selectScenario(target);
  }, [controller]);

  const openHelp = useCallback(() => {
    setHelp(true);
    controller.world?.command({ type: 'pause' });
  }, [controller]);
  const closeHelp = useCallback(() => {
    setHelp(false);
    controller.world?.command({ type: 'resume' });
  }, [controller]);
  const onEscape = useCallback(() => {
    if (helpRef.current) closeHelp();
    else openHelp();
  }, [closeHelp, openHelp]);
  const pausedByFocusLoss = useRef(false);
  const onFocusLost = useCallback(() => {
    const world = controller.world;
    if (!world || world.paused) return;
    world.command({ type: 'pause' });
    pausedByFocusLoss.current = true;
  }, [controller]);
  const toggleDeveloper = useCallback(() => setMode((m) => (m === 'player' ? 'developer' : 'player')), []);

  const scenarios = state.scenarios;
  const selectScenario = useCallback(
    (id: string) => {
      void controller.selectScenario(id);
    },
    [controller],
  );
  const startTour = () => {
    setTour({ active: true, index: 0 });
    const first = scenarios[0];
    if (first) selectScenario(first.id);
  };
  const tourGo = (index: number) => {
    const s = scenarios[index];
    if (!s) {
      setTour({ active: false, index: 0 });
      return;
    }
    setTour({ active: true, index });
    selectScenario(s.id);
  };

  // Resume only a pause that focus loss caused (never a deliberate P / Pause), and not while help is open.
  useEffect(() => {
    const onFocus = () => {
      if (!pausedByFocusLoss.current || helpRef.current) return;
      pausedByFocusLoss.current = false;
      controller.world?.command({ type: 'resume' });
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [controller]);

  const currentKind: ScenarioKind | undefined = state.scenario?.kind;

  return (
    <div className={`app ${inspectorOpen ? '' : 'inspector-collapsed'}`}>
      <header className="topbar">
        <div className="brand">
          <strong>SIDE-SCROLLER MILSIM</strong> <span className="muted">/ CONCEPT LAB</span>
          <span className="pitch muted">The map is known. The battlefield is not.</span>
        </div>
        <div className="topbar-controls">
          <span className={`chip ${state.disconnected ? 'bad' : state.transportKind === 'inprocess' ? 'warn' : 'ok'}`} title={state.transportLabel}>
            GraphQL: {state.transportKind === 'inprocess' ? 'in-process demo' : state.disconnected ? 'disconnected' : 'HTTP /graphql'}
          </span>
          {state.session && (
            <span className="chip" title="Session id">
              rev {state.session.revision}
            </span>
          )}
          <button className={mode === 'developer' ? 'on' : ''} onClick={toggleDeveloper} title="V">
            {mode === 'developer' ? 'Developer view' : 'Player view'}
          </button>
          <button onClick={startTour} disabled={state.mutating || scenarios.length === 0}>
            Guided tour
          </button>
          <button onClick={() => setInspectorOpen((o) => !o)}>{inspectorOpen ? 'Hide inspector' : 'Inspector'}</button>
          <button onClick={openHelp}>Help</button>
        </div>
      </header>

      <div className="main">
        <nav className="scenarios" aria-label="Scenarios">
          {scenarios.length === 0 && <div className="muted small pad">{state.error ? 'Catalogue unavailable.' : 'Loading scenarios…'}</div>}
          {scenarios.map((s) => (
            <button key={s.id} className={`scenario ${state.scenario?.id === s.id ? 'on' : ''}`} disabled={state.mutating} onClick={() => selectScenario(s.id)} title={s.description}>
              {s.title}
            </button>
          ))}
          {state.error && (
            <div className="error small pad">
              {state.error}
              <div className="btn-row">
                <button onClick={() => void retry()} disabled={state.mutating || state.phase === 'loading'}>
                  Retry
                </button>
                <button onClick={() => controller.dismissError()}>Dismiss</button>
              </div>
            </div>
          )}
          {state.disconnected && state.session && <div className="warn small pad">API disconnected. The local simulation keeps running; config changes will fail until the API returns. In-memory sessions vanish on server restart: use “New session” in the API panel.</div>}
        </nav>

        <section className="center">
          <div className="stage-wrap">
            <SceneCanvas controller={controller} mode={mode} devOptions={devOptions} onToggleDeveloper={toggleDeveloper} onEscape={onEscape} onFocusLost={onFocusLost} paused={p?.paused ?? false} />
            {p && <Hud p={p} />}
            {state.phase === 'loading' && <div className="loading">Loading scenario…</div>}
            {state.phase === 'error' && !state.scenario && <div className="loading error">Could not load a scenario. {state.error}</div>}
          </div>
          <div className="understage">
            {mode === 'developer' && <TopView controller={controller} />}
            {tour.active && state.scenario && currentKind ? (
              <Tour index={tour.index} total={scenarios.length} title={state.scenario.title} description={state.scenario.description} hint={TOUR_HINTS[currentKind]} busy={state.mutating || state.phase === 'loading'} onPrev={() => tourGo(tour.index - 1)} onNext={() => tourGo(tour.index + 1)} onExit={() => setTour({ active: false, index: 0 })} />
            ) : (
              state.scenario &&
              currentKind && (
                <div className="hint-card">
                  <strong>{state.scenario.title}</strong>
                  <p>{state.scenario.description}</p>
                  <p className="hint">Try: {TOUR_HINTS[currentKind]}</p>
                </div>
              )
            )}
          </div>
          <Gallery open={galleryOpen} onToggle={() => setGalleryOpen((o) => !o)} />
        </section>

        {inspectorOpen && <Inspector controller={controller} state={state} p={p} mode={mode} devOptions={devOptions} onDevOptions={setDevOptions} />}
      </div>
      {help && <Help onClose={closeHelp} />}
    </div>
  );
}
