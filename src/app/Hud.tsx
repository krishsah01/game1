/**
 * Player HUD: stance, speed, noise, depth, ammo, inventory, capture status,
 * camera link and own-camera status records. Deliberately shows no enemy
 * positions, no visibility scores and no event log.
 */
import { CAMERA } from '../shared/tuning.ts';
import { WEAPONS } from '../shared/weapons.ts';
import type { Presentation } from '../simulation/world.ts';

const COVER_LABEL: Record<string, string> = { none: '—', hidden: 'HIDDEN', observe: 'OBSERVE', aimOver: 'AIM OVER', peek: 'PEEK' };

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
          {pl.cover.state === 'none' && pl.cover.depthCover && <span className="hud-v">DEPTH COVER · F peek</span>}
          {pl.braced && <span className="hud-v amber">BRACED</span>}
          {pl.cover.aiming && pl.cover.state === 'none' && <span className="hud-v accent">ADS</span>}
          {!pl.cover.aiming && pl.equipped !== 'CAMERA' && <span className="hud-v muted">LOW READY</span>}
          {pl.scoped && pl.weapon.scope && <span className="hud-v accent">SCOPE {pl.weapon.scope.magnification}×</span>}
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
      {p.operating && (
        <div className="hud feed-banner" role="status">
          <span className="rec">● {p.operating.label} FEED</span>
          <span>
            GUN {p.operating.gunAmmo}/{p.operating.gunMagazine}
          </span>
          <span className="muted">body idle · O next / back</span>
        </div>
      )}
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
          <span className="hud-k">CAM LINK</span>
          <span className={`hud-v link ${p.cameraLink.status.toLowerCase()}`}>{p.cameraLink.statusLabel}</span>
          <span className="hud-k">U</span>
        </div>
        {p.cameras
          .filter((c) => c.team === 'FRIENDLY')
          .map((c) => (
            <div className="hud-row" key={c.id}>
              <span className="hud-k">{c.label}</span>
              <span className={`hud-v link ${c.status.toLowerCase()}`}>{c.statusLabel}</span>
              {c.deployed && <span className="hud-k">{c.mount}</span>}
              <span className="hud-k">GUN {c.gunAmmo}</span>
            </div>
          ))}
        {p.smoke.enabled && (
          <div className="hud-row">
            <span className="hud-v muted">SMOKE DEPLOYED</span>
          </div>
        )}
      </div>
      <div className="hud bottom-right">
        <div className="ammo">
          <span className="big">{pl.ammo}</span>
          <span className="small">/ {pl.weapon.magazine}</span>
        </div>
        <div className="hud-row inventory">
          <span className={`slot ${pl.equipped === 'PRIMARY' ? 'on' : ''}`}>
            1 {WEAPONS[pl.loadout.primary].label} {pl.magazines.PRIMARY}
          </span>
          <span className={`slot ${pl.equipped === 'SIDEARM' ? 'on' : ''}`}>
            2 {WEAPONS[pl.loadout.sidearm].label} {pl.magazines.SIDEARM}
          </span>
          <span className={`slot ${pl.equipped === 'CAMERA' ? 'on' : ''} ${pl.cameraCharges === 0 ? 'empty' : ''}`}>3 CAMERA ×{pl.cameraCharges}</span>
        </div>
        {pl.serviceable && pl.serviceable.gunAmmo < CAMERA.gunMagazine && (
          <div className="hud-row">
            <span className="hud-v accent">
              G · reload {pl.serviceable.label} gun ({pl.serviceable.gunAmmo})
            </span>
          </div>
        )}
        {pl.placement && (
          <div className="hud-row">
            <span className={`hud-v ${pl.placement.ok ? 'accent' : 'amber'}`}>{pl.placement.ok ? `PLACE · ${pl.placement.mount}` : pl.placement.reason}</span>
          </div>
        )}
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
        <span>F observe / peek</span>
        <span>RMB aim (raise rifle)</span>
        <span>LMB fire (aiming only)</span>
        <span>Q/E aim depth</span>
        <span>B brace</span>
        <span>1/2/3 primary/sidearm/camera</span>
        <span>U cam link</span>
        <span>O operate cam</span>
        <span>G reload cam gun</span>
        <span>Tab speed</span>
        <span>V developer</span>
        <span>Esc help</span>
      </div>
    </>
  );
}
