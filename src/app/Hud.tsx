/**
 * Player HUD: stance, speed, noise, depth, ammo, capture status, camera link
 * status. Deliberately shows no enemy positions, no visibility scores and no
 * event log.
 */
import { MAGAZINE_SIZE } from '../shared/tuning.ts';
import type { Presentation } from '../simulation/world.ts';

const COVER_LABEL: Record<string, string> = { none: '—', hidden: 'HIDDEN', observe: 'OBSERVE', aimOver: 'AIM OVER' };

export function Hud({ p }: { p: Presentation }) {
  const pl = p.player;
  const o = p.objective;
  const objectiveText =
    o.status === 'SECURED' ? 'CONTROL SECURED' : o.status === 'CONTESTED' ? 'CONTESTED' : o.status === 'CAPTURING' ? `CAPTURING ${Math.round(o.progress * 100)}%` : o.status === 'PAUSED' ? `PAUSED ${Math.round(o.progress * 100)}%` : 'CONTROL A';
  return (
    <>
      <div className="hud top-left">
        <div className="hud-row">
          <span className="tag attack">ATTACK</span>
          <span className="hud-k">STANCE</span>
          <span className="hud-v">{pl.stance === 'CROUCHED' ? 'CROUCH' : pl.stance === 'PRONE' ? 'PRONE' : 'STAND'}</span>
          {pl.vaultProgress !== null && <span className="hud-v amber">VAULT</span>}
          {pl.cover.state !== 'none' && <span className="hud-v accent">{COVER_LABEL[pl.cover.state]}</span>}
          {pl.braced && <span className="hud-v amber">BRACED</span>}
          {pl.cover.aiming && pl.cover.state === 'none' && <span className="hud-v accent">ADS</span>}
        </div>
        <div className="hud-row">
          <span className="hud-k">SPEED</span>
          <span className="hud-v">{pl.moveMode}</span>
          <span className="hud-k">NOISE</span>
          <span className={`hud-v ${pl.noiseLabel === 'LOUD' ? 'amber' : ''}`}>{pl.noiseLabel}</span>
        </div>
        <div className="hud-row">
          <span className="hud-k">DEPTH</span>
          <span className="hud-v">
            {pl.zoneLabel
              ? pl.depthTargetZ !== null
                ? `${pl.zoneLabel} · moving ${pl.depthLane}…`
                : pl.depthLane === 'FAR'
                  ? `${pl.zoneLabel} · FAR (S → lane)`
                  : `${pl.zoneLabel} · LANE (W → far)`
              : 'LANE (no depth zone here)'}
          </span>
        </div>
      </div>
      <div className="hud top-center">
        <div className={`objective ${o.status.toLowerCase()}`}>
          <span>{objectiveText}</span>
          <div className="bar">
            <div className="fill" style={{ width: `${Math.round(o.progress * 100)}%` }} />
          </div>
        </div>
      </div>
      <div className="hud top-right">
        <div className="hud-row">
          <span className="hud-k">{p.camera.label}</span>
          <span className={`hud-v link ${p.camera.status.toLowerCase()}`}>{p.camera.statusLabel}</span>
        </div>
        {p.smoke.enabled && (
          <div className="hud-row">
            <span className="hud-v muted">SMOKE DEPLOYED</span>
          </div>
        )}
      </div>
      <div className="hud bottom-right">
        <div className="ammo">
          <span className="big">{pl.ammo}</span>
          <span className="small">/ {MAGAZINE_SIZE}</span>
        </div>
        {p.message && (
          <div className="hud-row">
            <span className="hud-v amber">{p.message}</span>
          </div>
        )}
        <div className="hud-row">
          <span className="hud-k">AIM DEPTH</span>
          <span className="hud-v accent">
            {p.aim.depthWord} {p.aim.selectedDepth >= 0 ? '+' : ''}
            {p.aim.selectedDepth.toFixed(2)} m
          </span>
        </div>
      </div>
      <div className="hud bottom-left legend">
        <span>A/D move</span>
        <span>W far / S lane</span>
        <span>Space vault</span>
        <span>C crouch</span>
        <span>Z prone</span>
        <span>F observe</span>
        <span>RMB aim</span>
        <span>LMB fire</span>
        <span>Q/E aim depth</span>
        <span>B brace</span>
        <span>Tab speed</span>
        <span>V developer</span>
        <span>Esc help</span>
      </div>
    </>
  );
}
