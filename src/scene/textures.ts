/**
 * Procedural canvas textures (v0.2.4). Rendering only: nothing here feeds the
 * simulation. Textures are generated once per kind and shared; the seeded
 * noise keeps every run identical.
 */
import { CanvasTexture, ClampToEdgeWrapping, RepeatWrapping, SRGBColorSpace, type Texture } from 'three';

type Painter = (ctx: CanvasRenderingContext2D, w: number, h: number, rnd: () => number) => void;

const cache = new Map<string, CanvasTexture>();

/** Small deterministic PRNG (mulberry32). */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function make(key: string, w: number, h: number, paint: Painter, repeat = true): CanvasTexture {
  const hit = cache.get(key);
  if (hit) return hit;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  let seed = 0;
  for (const ch of key) seed = (seed * 31 + ch.charCodeAt(0)) | 0;
  paint(ctx, w, h, rng(seed));
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.wrapS = tex.wrapT = repeat ? RepeatWrapping : ClampToEdgeWrapping;
  tex.anisotropy = 4;
  cache.set(key, tex);
  return tex;
}

/** Speckle + blotches around a light base so material colour still tints it. */
function grime(ctx: CanvasRenderingContext2D, w: number, h: number, rnd: () => number, base: number, speckle: number, blotches: number): void {
  ctx.fillStyle = `rgb(${base},${base},${base})`;
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < blotches; i++) {
    const r = 8 + rnd() * 40;
    const g = ctx.createRadialGradient(rnd() * w, rnd() * h, 0, rnd() * w, rnd() * h, r);
    const v = base - 20 - rnd() * 30;
    g.addColorStop(0, `rgba(${v},${v},${v},0.35)`);
    g.addColorStop(1, `rgba(${v},${v},${v},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
  for (let i = 0; i < speckle; i++) {
    const v = base - 40 + rnd() * 70;
    ctx.fillStyle = `rgba(${v},${v},${v},0.5)`;
    ctx.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 1.5, 1 + rnd() * 1.5);
  }
}

/** Cast concrete with form-tie holes and a darker footing band. */
export const concreteTexture = (): Texture =>
  make('concrete', 256, 256, (ctx, w, h, rnd) => {
    grime(ctx, w, h, rnd, 225, 2600, 26);
    ctx.fillStyle = 'rgba(60,60,60,0.35)';
    for (const [x, y] of [
      [0.25, 0.3],
      [0.75, 0.3],
      [0.25, 0.75],
      [0.75, 0.75],
    ]) {
      ctx.beginPath();
      ctx.arc(x! * w, y! * h, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(70,70,70,0.25)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, w - 2, h - 2);
  });

/** Painted steel wall panels with vertical seams and rivets. */
export const panelTexture = (): Texture =>
  make('panel', 256, 256, (ctx, w, h, rnd) => {
    grime(ctx, w, h, rnd, 220, 1400, 14);
    ctx.strokeStyle = 'rgba(40,40,40,0.55)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(w / 2, 0);
    ctx.lineTo(w / 2, h);
    ctx.moveTo(0, h * 0.62);
    ctx.lineTo(w, h * 0.62);
    ctx.stroke();
    ctx.fillStyle = 'rgba(50,50,50,0.5)';
    for (let y = 10; y < h; y += 32) {
      for (const x of [6, w / 2 - 6, w / 2 + 6, w - 6]) ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
    }
  });

/** Olive ammunition-crate planks with a stencil band. */
export const crateTexture = (): Texture =>
  make('crate', 256, 256, (ctx, w, h, rnd) => {
    grime(ctx, w, h, rnd, 215, 1800, 10);
    ctx.strokeStyle = 'rgba(30,30,25,0.55)';
    ctx.lineWidth = 2;
    for (let y = h / 5; y < h; y += h / 5) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    ctx.lineWidth = 10;
    ctx.strokeStyle = 'rgba(40,40,30,0.45)';
    ctx.strokeRect(5, 5, w - 10, h - 10);
    ctx.fillStyle = 'rgba(245,240,215,0.75)';
    ctx.font = 'bold 30px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('CTG 5.56', w / 2, h / 2 - 4);
    ctx.font = 'bold 18px monospace';
    ctx.fillText('LOT 07-B  ▲▲', w / 2, h / 2 + 24);
  });

/** Corrugated floor plate. */
export const floorTexture = (): Texture =>
  make('floor', 256, 64, (ctx, w, h, rnd) => {
    grime(ctx, w, h, rnd, 210, 900, 6);
    ctx.strokeStyle = 'rgba(40,40,40,0.4)';
    ctx.lineWidth = 2;
    for (let x = 0; x < w; x += 16) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + 8, h);
      ctx.stroke();
    }
  });

/** Yellow/black diagonal hazard stripes. */
export const hazardTexture = (): Texture =>
  make('hazard', 128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#e8b21c';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#1b1b1b';
    for (let i = -h; i < w + h; i += 32) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + 16, 0);
      ctx.lineTo(i + 16 - h, h);
      ctx.lineTo(i - h, h);
      ctx.closePath();
      ctx.fill();
    }
  });

/**
 * Facility sign: hazard border, pictogram (a figure stepping back into a
 * recess, the "depth cover" glyph) and two lines of stencil text.
 */
export function signTexture(key: string, title: string, subtitle: string): Texture {
  return make(
    `sign:${key}:${title}:${subtitle}`,
    512,
    192,
    (ctx, w, h) => {
      ctx.fillStyle = '#1b1b1b';
      ctx.fillRect(0, 0, w, h);
      // Hazard border.
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, w, h);
      ctx.rect(14, 14, w - 28, h - 28);
      ctx.clip('evenodd');
      ctx.fillStyle = '#e8b21c';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#1b1b1b';
      for (let i = -h; i < w + h; i += 28) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i + 14, 0);
        ctx.lineTo(i + 14 - h, h);
        ctx.lineTo(i - h, h);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
      ctx.fillStyle = '#e8b21c';
      ctx.fillRect(22, 22, w - 44, h - 44);
      // Pictogram: a recess (open box seen from above) with an arrow into it.
      const px = 92;
      const py = h / 2;
      ctx.strokeStyle = '#1b1b1b';
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(px - 46, py - 40);
      ctx.lineTo(px - 46, py + 40);
      ctx.lineTo(px + 46, py + 40);
      ctx.lineTo(px + 46, py - 40);
      ctx.stroke();
      ctx.fillStyle = '#1b1b1b';
      ctx.beginPath();
      ctx.moveTo(px, py + 26);
      ctx.lineTo(px - 22, py - 4);
      ctx.lineTo(px - 8, py - 4);
      ctx.lineTo(px - 8, py - 34);
      ctx.lineTo(px + 8, py - 34);
      ctx.lineTo(px + 8, py - 4);
      ctx.lineTo(px + 22, py - 4);
      ctx.closePath();
      ctx.fill();
      // Text.
      ctx.fillStyle = '#1b1b1b';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.font = 'bold 44px "Arial Narrow", Arial, sans-serif';
      ctx.fillText(title, 164, h / 2 - 22, w - 190);
      ctx.font = 'bold 26px "Arial Narrow", Arial, sans-serif';
      ctx.fillText(subtitle, 164, h / 2 + 28, w - 190);
    },
    false,
  );
}

/** Repeats a shared texture for a given surface size (metres per tile). */
export function tiled(tex: Texture, sizeX: number, sizeY: number, metresPerTile: number): Texture {
  const t = tex.clone();
  t.needsUpdate = true;
  t.repeat.set(Math.max(1, sizeX / metresPerTile), Math.max(1, sizeY / metresPerTile));
  return t;
}
