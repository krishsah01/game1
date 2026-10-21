/**
 * Collapsible inspector: scenario, stance & exposure, direct visibility,
 * camera, smoke/noise, aim/depth, capture, developer tuning and API status.
 * Buttons manipulate the real simulation or send real GraphQL mutations.
 */
import { useCallback, useState } from 'react';
import type { ApiClient } from '../graphql/client.ts';
import { SELECTED_DEPTH_MAX, SELECTED_DEPTH_MIN } from '../shared/tuning.ts';
import type { CameraStatus, DemoConfig, MoveMode } from '../shared/types.ts';
import type { Command } from '../simulation/input.ts';
import type { Presentation } from '../simulation/world.ts';
import { useApiRecords, useDebouncedCommit } from './hooks.ts';
import type { DevOptions } from './SceneCanvas.tsx';
import type { ControllerState, SessionController } from './sessionController.ts';

interface Props {
  controller: SessionController;
  state: ControllerState;
  p: Presentation | null;
  mode: 'player' | 'developer';
  devOptions: DevOptions;
  onDevOptions: (o: DevOptions) => void;
}

function Section({ title, children, open = true }: { title: string; children: React.ReactNode; open?: boolean }) {
  return (
    <details className="section" open={open}>
      <summary>{title}</summary>
      <div className="section-body">{children}</div>
    </details>
  );
}

function Slider({ label, value, min, max, step, unit, onCommit, disabled }: { label: string; value: number; min: number; max: number; step: number; unit: string; onCommit: (v: number) => void; disabled?: boolean }) {
  const [local, setLocal] = useDebouncedCommit(value, onCommit);
  return (
    <label className="slider">
      <span className="slider-label">
        {label} <b>{local.toFixed(step < 0.1 ? 2 : 1)} {unit}</b>
      </span>
      <input type="range" min={min} max={max} step={step} value={local} disabled={disabled} onChange={(e) => setLocal(Number(e.target.value))} />
    </label>
  );
}

export function Inspector({ controller, state, p, mode, devOptions, onDevOptions }: Props) {
  const records = useApiRecords(controller.client);
  const [lastError, setLastError] = useState<string | null>(null);
  const cmd = (c: Command) => controller.world?.command(c);
  const cfg = state.session?.config;
  const patch = useCallback(
    (fields: Partial<DemoConfig>) => {
      setLastError(null);
      controller.updateConfig(fields).catch((err: Error) => setLastError(err.message));
    },
    [controller],
  );
  const dev = mode === 'developer';
  const pl = p?.player;
  const busy = state.mutating;
  const scenarioKind = state.scenario?.kind;
  const enemyIds = p ? (p.dev ? p.dev.rawTruth.map((t) => t.id) : []) : [];

  const sendInvalid = () => {
    setLastError(null);
    controller.updateConfig({ visionRange: -5 }).catch((err: Error) => setLastError(err.message));
  };
  const sendStale = () => {
    const s = state.session;
    if (!s) return;
    setLastError(null);
    controller.client.updateConfig(s.id, Math.max(1, s.revision - 1) === s.revision ? s.revision + 5 : 1, { smokeEnabled: s.config.smokeEnabled }).catch((err: Error) => setLastError(err.message));
  };

  return (
    <aside className="inspector">
      <Section title="Scenario">
        <p className="muted small">{state.scenario?.description}</p>
        <div className="btn-row">
          <button disabled={busy || !state.session} onClick={() => controller.reset().catch(() => undefined)}>
            Reset (server)
          </button>
          <button disabled={!controller.world} onClick={() => controller.resetLocally()}>
            Reset locally
          </button>
          <button disabled={busy} onClick={() => cmd({ type: 'togglePause' })}>
            {p?.paused ? 'Resume' : 'Pause'}
          </button>
          <button disabled={!p?.paused} onClick={() => cmd({ type: 'stepOnce' })}>
            Step
          </button>
        </div>
        <div className="btn-row">
          <span className="muted small">Stations:</span>
          <button onClick={() => cmd({ type: 'teleportPlayer', x: -11.5, z: 0, facingX: 1 })}>A</button>
          <button onClick={() => cmd({ type: 'teleportPlayer', x: -2.6, z: 0, facingX: 1 })}>B near</button>
          <button onClick={() => cmd({ type: 'teleportPlayer', x: 8.8, z: 0, facingX: -1 })}>B far</button>
          <button onClick={() => cmd({ type: 'teleportPlayer', x: 6.5, z: 0, facingX: 1 })}>C</button>
          <button onClick={() => cmd({ type: 'teleportPlayer', x: 13.0, z: 0, facingX: 1 })}>Control A</button>
        </div>
      </Section>

      <Section title="Stance and exposure">
        <div className="btn-row">
          <button className={pl?.stance === 'STANDING' ? 'on' : ''} onClick={() => cmd({ type: 'setStance', stance: 'STANDING' })}>
            Stand
          </button>
          <button className={pl?.stance === 'CROUCHED' ? 'on' : ''} onClick={() => cmd({ type: 'setStance', stance: 'CROUCHED' })}>
            Crouch
          </button>
          <button className={pl?.stance === 'PRONE' ? 'on' : ''} onClick={() => cmd({ type: 'setStance', stance: 'PRONE' })}>
            Prone
          </button>
          <button className={pl?.braced ? 'on' : ''} onClick={() => cmd({ type: 'toggleBrace' })}>
            Brace
          </button>
          <button className={pl?.vaultProgress !== null && pl?.vaultProgress !== undefined ? 'on' : ''} onClick={() => cmd({ type: 'vault' })} title="Space">
            Vault
          </button>
        </div>
        <div className="btn-row">
          <span className="muted small">Depth (on/off):</span>
          <button className={pl?.depthLane === 'FAR' ? 'on' : ''} disabled={!pl?.zoneLabel} onClick={() => cmd({ type: 'setDepthLane', lane: 'FAR' })} title="W">
            Go FAR
          </button>
          <button className={pl?.depthLane === 'LANE' ? 'on' : ''} onClick={() => cmd({ type: 'setDepthLane', lane: 'LANE' })} title="S">
            Back to lane
          </button>
          <span className="muted small">{pl?.zoneLabel ? `${pl.zoneLabel} · far edge z ${pl.zoneFarZ?.toFixed(1)}` : 'no depth zone here'}</span>
        </div>
        <div className="btn-row">
          <span className="muted small">Cover state:</span>
          <button className={pl?.cover.state === 'hidden' ? 'on' : ''} onClick={() => cmd({ type: 'setCoverIntent', intent: 'hidden' })}>
            Hidden
          </button>
          <button className={pl?.cover.state === 'observe' ? 'on' : ''} onClick={() => cmd({ type: 'setCoverIntent', intent: 'observe' })}>
            Observe
          </button>
          <button className={pl?.cover.state === 'aimOver' ? 'on' : ''} onClick={() => cmd({ type: 'setCoverIntent', intent: 'aimOver' })}>
            Aim over
          </button>
        </div>
        <div className="btn-row">
          <button onClick={() => cmd({ type: 'testFiringLine' })}>Test firing line</button>
          <button onClick={() => cmd({ type: 'fire' })}>Fire</button>
          <button onClick={() => cmd({ type: 'reload' })}>Reload</button>
        </div>
        {pl && (
          <table className="kv">
            <tbody>
              <tr>
                <td>State</td>
                <td>
                  {pl.cover.state} {pl.coverId ? `(at ${pl.coverId})` : pl.cover.depthCover ? `(depth cover ${pl.cover.depthCover.id})` : ''}
                  {pl.cover.peekLean !== 0 ? ` · lean ${pl.cover.peekLean.toFixed(2)} m` : ''}
                </td>
              </tr>
              <tr>
                <td>Eye y</td>
                <td>{pl.cover.eye.y.toFixed(2)} m</td>
              </tr>
              <tr>
                <td>Muzzle y</td>
                <td>
                  {pl.cover.muzzle.y.toFixed(2)} m · pitch {((pl.cover.aimPitch * 180) / Math.PI).toFixed(0)}°{pl.cover.muzzleClamped ? ' · pressed to cover' : ''}
                </td>
              </tr>
              {dev && (
                <tr>
                  <td>Exposed samples</td>
                  <td>{pl.exposure.filter((e) => e.exposed).map((e) => e.name).join(', ') || 'none'}</td>
                </tr>
              )}
              {dev && p?.dev?.lastFiringLineTest && (
                <tr>
                  <td>Firing-line test</td>
                  <td>{p.dev.lastFiringLineTest.result.hit ? `${p.dev.lastFiringLineTest.result.hit.kind} ${p.dev.lastFiringLineTest.result.hit.id} @ ${p.dev.lastFiringLineTest.result.hit.t.toFixed(2)} m` : 'no obstruction in range'}</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
        <div className="btn-row">
          <span className="muted small">Speed (Tab):</span>
          {(['WALK', 'COMBAT', 'SPRINT'] as MoveMode[]).map((m) => (
            <button key={m} className={pl?.moveMode === m ? 'on' : ''} onClick={() => cmd({ type: 'setMoveMode', mode: m })}>
              {m}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Direct visibility">
        {cfg && (
          <>
            <Slider label="Vision range" value={cfg.visionRange} min={2} max={40} step={1} unit="m" onCommit={(v) => patch({ visionRange: v })} />
            <Slider label="Field of view" value={cfg.visionFovDegrees} min={20} max={180} step={5} unit="°" onCommit={(v) => patch({ visionFovDegrees: v })} />
            <Slider label="Last-known expiry" value={cfg.lastKnownSeconds} min={2} max={60} step={1} unit="s" onCommit={(v) => patch({ lastKnownSeconds: v })} />
          </>
        )}
        {p && (
          <p className="small muted">
            Observed now: {p.entities.filter((e) => e.observed).map((e) => `${e.label}${dev ? ` (${e.sources.map((s) => (s === 'player' ? 'DIRECT' : s === p.camera.id ? p.camera.label : s.toUpperCase())).join('+')})` : ''}`).join(', ') || 'nothing dynamic'}
          </p>
        )}
        {dev && p?.dev && (
          <table className="kv">
            <tbody>
              {p.dev.playerSight.map((o) => (
                <tr key={o.entityId}>
                  <td>{o.entityId}</td>
                  <td>{o.samples.map((s) => `${s.name}:${s.reason}${s.blockedBy ? `(${s.blockedBy})` : ''}`).join(' ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section title="Camera (CAM 01)">
        <div className="btn-row">
          {(['ONLINE', 'JAMMED', 'DESTROYED', 'OFFLINE'] as CameraStatus[]).map((s) => (
            <button key={s} className={cfg?.cameraStatus === s ? 'on' : ''} disabled={!cfg} onClick={() => patch({ cameraStatus: s })}>
              {s}
            </button>
          ))}
        </div>
        <p className="small muted">Link status is player-owned UI. The device mesh is drawn only when it is actually observed.</p>
      </Section>

      <Section title="Smoke and noise">
        <div className="btn-row">
          <button className={cfg?.smokeEnabled ? 'on' : ''} disabled={!cfg} onClick={() => patch({ smokeEnabled: !cfg?.smokeEnabled })}>
            Smoke {cfg?.smokeEnabled ? 'ON' : 'OFF'}
          </button>
        </div>
        {(scenarioKind === 'SMOKE_SOUND' || scenarioKind === 'HIDDEN_BATTLEFIELD') && (
          <div className="btn-row">
            <span className="muted small">OPFOR B movement:</span>
            {(['WALK', 'COMBAT', 'SPRINT'] as MoveMode[]).map((m) => (
              <button key={m} onClick={() => cmd({ type: 'setActorMoveMode', id: 'enemy-b', mode: m })}>
                {m}
              </button>
            ))}
          </div>
        )}
        <p className="small muted">Sound arcs show rough direction and loudness only. Smoke blocks sight for every source but not bullets.</p>
      </Section>

      <Section title="Aim and depth">
        <div className="btn-row">
          <span className="muted small">Selected depth:</span>
          <button onClick={() => cmd({ type: 'setSelectedDepth', depth: 0.75 })}>NEAR</button>
          <button onClick={() => cmd({ type: 'setSelectedDepth', depth: 0 })}>MID</button>
          <button onClick={() => cmd({ type: 'setSelectedDepth', depth: -0.75 })}>FAR</button>
          <button onClick={() => cmd({ type: 'stepDepth', direction: -1 })}>−</button>
          <button onClick={() => cmd({ type: 'stepDepth', direction: 1 })}>+</button>
        </div>
        {p && (
          <table className="kv">
            <tbody>
              <tr>
                <td>Selected depth</td>
                <td>
                  {p.aim.depthWord} z {p.aim.selectedDepth.toFixed(2)} (range {SELECTED_DEPTH_MIN}…{SELECTED_DEPTH_MAX})
                </td>
              </tr>
              <tr>
                <td>Sway</td>
                <td>
                  ±{p.aim.amplitude.toFixed(2)} m · {p.aim.situation}
                </td>
              </tr>
              <tr>
                <td>Last shot offset</td>
                <td>{p.aim.lastSampledOffset === null ? '—' : `${p.aim.lastSampledOffset >= 0 ? '+' : ''}${p.aim.lastSampledOffset.toFixed(2)} m`}</td>
              </tr>
            </tbody>
          </table>
        )}
        {scenarioKind === 'DEPTH_SHOT' && (
          <div className="btn-row">
            <span className="muted small">Target depth:</span>
            <button onClick={() => cmd({ type: 'setActorDepth', id: 'enemy-c', z: 0.7 })}>NEAR</button>
            <button onClick={() => cmd({ type: 'setActorDepth', id: 'enemy-c', z: 0 })}>MID</button>
            <button onClick={() => cmd({ type: 'setActorDepth', id: 'enemy-c', z: -0.9 })}>FAR</button>
          </div>
        )}
        {cfg && (
          <>
            <Slider label="Base sway amplitude" value={cfg.baseSwayAmplitude} min={0} max={1.5} step={0.02} unit="m" onCommit={(v) => patch({ baseSwayAmplitude: v })} />
            <Slider label="Sway frequency" value={cfg.swayFrequencyHz} min={0.1} max={2} step={0.05} unit="Hz" onCommit={(v) => patch({ swayFrequencyHz: v })} />
            <Slider label="Settle time" value={cfg.settleSeconds} min={0} max={4} step={0.1} unit="s" onCommit={(v) => patch({ settleSeconds: v })} />
          </>
        )}
        <p className="small muted">Proposed mapping: reticle dot offset = world-Z offset around the selected depth. Exaggerate with the sliders for explanation; defaults stay modest.</p>
      </Section>

      <Section title="Capture (CONTROL A)">
        {p && (
          <table className="kv">
            <tbody>
              <tr>
                <td>Status</td>
                <td>{p.objective.status}</td>
              </tr>
              <tr>
                <td>Progress</td>
                <td>{Math.round(p.objective.progress * 100)}%</td>
              </tr>
              <tr>
                <td>Attacker inside</td>
                <td>{p.objective.attackerInside ? 'yes' : 'no'}</td>
              </tr>
              {dev && (
                <tr>
                  <td>Defenders inside</td>
                  <td>{p.objective.defendersInside}</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
        {scenarioKind === 'CONTROL_POINT' && (
          <div className="btn-row">
            <button onClick={() => cmd({ type: 'setContestTarget', index: 1 })}>Defender: enter zone</button>
            <button onClick={() => cmd({ type: 'setContestTarget', index: 0 })}>Defender: leave</button>
          </div>
        )}
        {cfg && <Slider label="Capture time" value={cfg.captureSeconds} min={2} max={40} step={1} unit="s" onCommit={(v) => patch({ captureSeconds: v })} />}
        <p className="small muted">CONTESTED reveals occupancy by design (a limited information exception). It never shows where the defender is.</p>
      </Section>

      {dev && (
        <Section title="Developer overlays">
          <div className="btn-row">
            <button className={devOptions.showRays ? 'on' : ''} onClick={() => onDevOptions({ ...devOptions, showRays: !devOptions.showRays })}>
              Sight / firing rays
            </button>
            <button className={devOptions.showColliders ? 'on' : ''} onClick={() => onDevOptions({ ...devOptions, showColliders: !devOptions.showColliders })}>
              Colliders
            </button>
            <button className={devOptions.showCones ? 'on' : ''} onClick={() => onDevOptions({ ...devOptions, showCones: !devOptions.showCones })}>
              Cones
            </button>
            <button className={devOptions.showZones ? 'on' : ''} onClick={() => onDevOptions({ ...devOptions, showZones: !devOptions.showZones })}>
              Zones
            </button>
          </div>
          <p className="small muted">Cyan = eye and sight. Amber = muzzle and firing line. Magenta wireframe = unobserved truth. Cones are explanatory, not the visibility algorithm.</p>
          {p?.dev && (
            <div className="log">
              {p.dev.log
                .slice()
                .reverse()
                .map((l, i) => (
                  <div key={i}>
                    <span className="muted">{l.simTime.toFixed(1)}s</span> {l.text}
                  </div>
                ))}
            </div>
          )}
          {enemyIds.length > 0 && p?.dev && (
            <table className="kv">
              <tbody>
                {p.dev.rawTruth.map((t) => (
                  <tr key={t.id}>
                    <td>{t.id}</td>
                    <td>
                      x {t.position.x.toFixed(2)} z {t.position.z.toFixed(2)} · {t.observed ? 'observed' : `hidden (${t.confirmTicks})`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>
      )}

      <Section title="API status" open={dev}>
        <table className="kv">
          <tbody>
            <tr>
              <td>GraphQL</td>
              <td>{state.transportKind === 'inprocess' ? 'in-process demo' : state.transportLabel}</td>
            </tr>
            <tr>
              <td>Session</td>
              <td>{state.session ? `${state.session.id} · rev ${state.session.revision}` : '—'}</td>
            </tr>
            <tr>
              <td>Link</td>
              <td>{state.disconnected ? 'DISCONNECTED (local simulation continues)' : 'ok'}</td>
            </tr>
          </tbody>
        </table>
        <div className="btn-row">
          <button onClick={sendInvalid} disabled={!state.session}>
            Send invalid config
          </button>
          <button onClick={sendStale} disabled={!state.session}>
            Send stale revision
          </button>
          <button onClick={() => state.scenario && controller.selectScenario(state.scenario.id)} disabled={!state.scenario || busy}>
            New session
          </button>
        </div>
        {lastError && <p className="error small">{lastError}</p>}
        <div className="ops">
          {records
            .slice()
            .reverse()
            .slice(0, 12)
            .map((r) => (
              <div key={r.id} className={`op ${r.status}`}>
                <span className="op-name">{r.name}</span>
                <span className="op-kind">{r.kind}</span>
                <span className="op-status">{r.status === 'ok' ? `ok${r.revision !== null ? ` rev ${r.revision}` : ''}` : r.status === 'error' ? `${r.code ?? 'error'}` : '…'}</span>
                <span className="op-ms">{r.durationMs !== null ? `${r.durationMs.toFixed(0)} ms` : ''}</span>
                {r.message && <span className="op-msg">{r.message}</span>}
              </div>
            ))}
        </div>
      </Section>
    </aside>
  );
}

export type { ApiClient };
