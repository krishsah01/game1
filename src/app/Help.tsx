export function Help({ onClose }: { onClose: () => void }) {
  return (
    <div className="help-overlay" role="dialog" aria-label="Help">
      <div className="help">
        <h2>SIDE-SCROLLER MILSIM / CONCEPT LAB</h2>
        <p className="muted">The map is known. The battlefield is not. This is a throwaway web demonstrator of the concept, not the Godot game.</p>
        <table className="controls">
          <tbody>
            <tr>
              <td>A / D, ← →</td>
              <td>Move left / right</td>
            </tr>
            <tr>
              <td>W / S</td>
              <td>Depth is on/off: W glides to the FAR edge of the depth zone you stand in, S glides back to the lane (z = 0). Nothing moves toward the camera.</td>
            </tr>
            <tr>
              <td>Space</td>
              <td>Vault the low wall ahead (standing or crouched). Vaultable walls span the whole depth, so over the top is the only way past.</td>
            </tr>
            <tr>
              <td>Tab</td>
              <td>Cycle walk (quiet) → combat move → sprint (loud, unstable)</td>
            </tr>
            <tr>
              <td>C</td>
              <td>Toggle crouch (crouched at waist-high cover = hidden); from prone, rises to a crouch</td>
            </tr>
            <tr>
              <td>Z</td>
              <td>Toggle prone: slow crawl, lowest profile, steadiest aim, cannot vault</td>
            </tr>
            <tr>
              <td>F (hold)</td>
              <td>Observe above cover: eyes clear, muzzle stays blocked. Off the lane behind full-height depth cover, peek: the head leans out around its edge toward the lane, the body and rifle stay behind it</td>
            </tr>
            <tr>
              <td>Right mouse (hold)</td>
              <td>Aim; from crouched cover raises head and muzzle (aim over)</td>
            </tr>
            <tr>
              <td>Left mouse</td>
              <td>Fire a demonstrator shot (disabled while hidden or vaulting)</td>
            </tr>
            <tr>
              <td>Mouse height</td>
              <td>The arms and rifle swing toward the pointer; the shot leaves the raised or lowered barrel tip</td>
            </tr>
            <tr>
              <td>Q / E</td>
              <td>Selected aim depth − / + (world Z, never auto-locked to an enemy)</td>
            </tr>
            <tr>
              <td>1 / 2</td>
              <td>Equip the rifle (1) or a deployable camera (2). With the camera equipped, left mouse places it on the floor, ceiling or cover nearest the pointer (within reach); it snaps to the surface and sits on the lane (depth 0)</td>
            </tr>
            <tr>
              <td>U</td>
              <td>Activate / deactivate the camera link. Your cameras feed sight only while the link is LIVE. Any camera, yours or theirs, can be shot and destroyed; the opposition sees your cameras only through its own view cones</td>
            </tr>
            <tr>
              <td>B</td>
              <td>Brace on nearby cover (not while moving or sprinting)</td>
            </tr>
            <tr>
              <td>V</td>
              <td>Toggle developer view (omniscient overlays)</td>
            </tr>
            <tr>
              <td>P / .</td>
              <td>Pause / step one tick</td>
            </tr>
            <tr>
              <td>R</td>
              <td>Reload</td>
            </tr>
            <tr>
              <td>Esc</td>
              <td>This help (pauses the simulation)</td>
            </tr>
          </tbody>
        </table>
        <p className="muted small">Axes in code: X = left/right, Y = up, Z = depth (+Z toward the camera). The original notes call depth “Y”; here it is always Z.</p>
        <button className="primary" onClick={onClose}>
          Resume
        </button>
      </div>
    </div>
  );
}
