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
              <td>Step into the screen (FAR) / toward the camera (NEAR) inside a marked depth zone</td>
            </tr>
            <tr>
              <td>1 / 2 / 3</td>
              <td>Walk (quiet) / combat move / sprint (loud, unstable)</td>
            </tr>
            <tr>
              <td>C</td>
              <td>Toggle crouch (crouched at waist-high cover = hidden)</td>
            </tr>
            <tr>
              <td>Space (hold)</td>
              <td>Observe above cover: eyes clear, muzzle stays blocked</td>
            </tr>
            <tr>
              <td>Right mouse (hold)</td>
              <td>Aim; from crouched cover raises head and muzzle (aim over)</td>
            </tr>
            <tr>
              <td>Left mouse</td>
              <td>Fire a demonstrator shot (disabled while hidden)</td>
            </tr>
            <tr>
              <td>Q / E</td>
              <td>Selected aim depth − / + (world Z, never auto-locked to an enemy)</td>
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
