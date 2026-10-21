import type { ScenarioKind } from '../shared/types.ts';

export const TOUR_HINTS: Record<ScenarioKind, string> = {
  HIDDEN_BATTLEFIELD: 'Press V to compare omniscient truth with what the player may see. Walk right (D): the partition stops you; press W in the doorway lane to go FAR and pass, S to come back. Turn left and press Space to vault the low wall.',
  EXPOSURE_LADDER: 'Hold F to observe, then hold the right mouse button to aim over. Use “Test firing line” in the observe state: the muzzle still hits concrete. Z goes prone behind the wall; Space vaults it.',
  CAMERA_INTEL: 'Press U (or set the link to ONLINE in the inspector — the same updateConfig mutation). The enemy and bag appear only inside the camera’s unblocked view.',
  LOST_CONTACT: 'Jam the camera within a few seconds, or wait: the enemy walks into the camera blind spot. The LAST SEEN marker stays put while the enemy keeps moving.',
  SMOKE_SOUND: 'Toggle Smoke ON: both you and CAM 01 lose the patrol. Switch OPFOR B to SPRINT and compare the sound arcs with WALK.',
  DEPTH_SHOT: 'Aim at the target through the slot. Press Q/E to change selected depth, B to brace, then fire. The tracer shows a hit, a jamb strike or a depth miss. W moves you to the FAR edge of the approach zone: the same target hides behind the far jamb. Walk up to the jamb and hold F to peek around it through the slot.',
  CONTROL_POINT: 'Walk right into CONTROL A to capture. Click “Defender: enter zone”: progress pauses and the public CONTESTED state appears without a defender marker.',
  MARKSMAN: 'Hold the right mouse button with the DMR: the 4× scope pans the view further in the direction you face. Press 2 for the pistol (the DMR stays on your back with its own magazine), 1 to switch back. The inspector Loadout section swaps either slot.',
  CAMERA_WAR: 'Press 3 to equip a camera, point at the top of the low wall and click: it snaps on (depth 0). Press U to bring the link LIVE and watch OPFOR A through it while you stay hidden. Press 1 and shoot the OPFOR CAM under the ceiling. In developer view (V) the red fans show who has spotted your camera.',
};

interface Props {
  index: number;
  total: number;
  title: string;
  description: string;
  hint: string;
  busy?: boolean;
  onPrev: () => void;
  onNext: () => void;
  onExit: () => void;
}

export function Tour({ index, total, title, description, hint, busy = false, onPrev, onNext, onExit }: Props) {
  return (
    <div className="tour" role="dialog" aria-label="Guided tour">
      <div className="tour-head">
        <span className="tour-step">
          TOUR {index + 1} / {total}
        </span>
        <strong>{title}</strong>
        <button className="link" onClick={onExit}>
          Exit tour
        </button>
      </div>
      <p>{description}</p>
      <p className="hint">{hint}</p>
      <div className="btn-row">
        <button disabled={index === 0 || busy} onClick={onPrev}>
          ← Previous
        </button>
        <button className="primary" disabled={busy} onClick={onNext}>
          {index + 1 < total ? 'Next →' : 'Finish'}
        </button>
      </div>
    </div>
  );
}
