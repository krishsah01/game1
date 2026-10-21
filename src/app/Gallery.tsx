import board1 from '../../reference-images/01-gameplay-direction.png';
import board2 from '../../reference-images/02-visibility-and-recon.png';
import board3 from '../../reference-images/03-cover-and-exposure.png';
import board4 from '../../reference-images/04-depth-aiming-study.png';

const BOARDS = [
  { src: board1, title: '01 / Gameplay direction', caption: 'Atmosphere, military silhouettes, muted industrial environment and restrained HUD. Persistent map stays readable; dynamic objects need observation.' },
  { src: board2, title: '02 / Visibility & recon', caption: 'Direct sight, camera reveal, stale last-known marker and signal loss with imprecise sound. Cone overlays are developer explanations.' },
  { src: board3, title: '03 / Cover & exposure', caption: 'Hidden, observe, aim. Sight begins at the head, fire begins at the muzzle: the middle state sees while the muzzle is blocked.' },
  { src: board4, title: '04 / Depth aiming study', caption: 'Proposed, not locked: screen aim sets direction, reticle phase samples depth. The top view is a developer inset, not a gameplay camera.' },
];

export function Gallery({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <div className={`gallery ${open ? 'open' : ''}`}>
      <button className="gallery-toggle" onClick={onToggle} aria-expanded={open}>
        {open ? '▾ Hide reference boards' : '▸ Reference boards (concept art, not screenshots)'}
      </button>
      {open && (
        <div className="gallery-row">
          {BOARDS.map((b) => (
            <figure key={b.title}>
              <a href={b.src} target="_blank" rel="noreferrer">
                <img src={b.src} alt={b.title} loading="lazy" />
              </a>
              <figcaption>
                <strong>{b.title}</strong> {b.caption}
              </figcaption>
            </figure>
          ))}
        </div>
      )}
    </div>
  );
}
