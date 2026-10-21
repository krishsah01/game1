/**
 * World-anchored HTML labels. Each label is a DOM node positioned by
 * projecting a world point through the fixed orthographic camera. Used for
 * station names, depth words, the LAST SEEN marker, the camera tag and the
 * CONTROL A readout. Depth never changes where a label lands on screen,
 * which is exactly the ambiguity the prototype is meant to show.
 */
import { Vector3, type Camera } from 'three';

export interface LabelHandle {
  el: HTMLDivElement;
  world: Vector3;
  /** Pixel offset applied after projection. */
  dx: number;
  dy: number;
}

export class LabelLayer {
  private labels = new Map<string, LabelHandle>();
  private tmp = new Vector3();

  constructor(private root: HTMLElement) {}

  /** `text` is the main line, `sub` an optional second line (rendered via CSS attr(), never as HTML). */
  upsert(id: string, className: string, text: string, world: { x: number; y: number; z: number }, dx = 0, dy = 0, sub = ''): LabelHandle {
    let h = this.labels.get(id);
    if (!h) {
      const el = document.createElement('div');
      el.className = `wlabel ${className}`;
      this.root.appendChild(el);
      h = { el, world: new Vector3(), dx, dy };
      this.labels.set(id, h);
    }
    if (h.el.className !== `wlabel ${className}`) h.el.className = `wlabel ${className}`;
    if (h.el.textContent !== text) h.el.textContent = text;
    if ((h.el.dataset.sub ?? '') !== sub) h.el.dataset.sub = sub;
    h.world.set(world.x, world.y, world.z);
    h.dx = dx;
    h.dy = dy;
    h.el.style.display = '';
    return h;
  }

  remove(id: string): void {
    const h = this.labels.get(id);
    if (!h) return;
    h.el.remove();
    this.labels.delete(id);
  }

  /** Hides labels whose ids are not in `keep` (prefix match). */
  prune(prefix: string, keep: Set<string>): void {
    for (const id of [...this.labels.keys()]) {
      if (id.startsWith(prefix) && !keep.has(id)) this.remove(id);
    }
  }

  update(camera: Camera, width: number, height: number): void {
    for (const h of this.labels.values()) {
      this.tmp.copy(h.world).project(camera);
      const x = (this.tmp.x * 0.5 + 0.5) * width + h.dx;
      const y = (-this.tmp.y * 0.5 + 0.5) * height + h.dy;
      const onScreen = x > -200 && x < width + 200 && y > -100 && y < height + 100;
      h.el.style.transform = `translate(-50%, -50%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      h.el.style.visibility = onScreen ? 'visible' : 'hidden';
    }
  }

  dispose(): void {
    for (const h of this.labels.values()) h.el.remove();
    this.labels.clear();
  }
}
