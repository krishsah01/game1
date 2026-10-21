/**
 * Map dressing (v0.2.4): surface textures for the gameplay colliders and
 * decorative detail that never leaves a collider's bounds or sits in front of
 * the lane, plus facility signage that marks every depth zone in-world.
 *
 * Everything returned as decor is flagged `userData.decorative = true` and has
 * no gameplay role; collision, sight and shots still use the collider boxes.
 */
import { BoxGeometry, CylinderGeometry, Group, Mesh, MeshStandardMaterial, PlaneGeometry, type Object3D, type Texture } from 'three';
import { aabbFromBounds } from '../shared/geometry.ts';
import type { ColliderSeed, DepthZone } from '../shared/types.ts';
import { concreteTexture, crateTexture, floorTexture, hazardTexture, panelTexture, signTexture, tiled } from './textures.ts';

const decor = <T extends Object3D>(o: T): T => {
  o.userData.decorative = true;
  o.traverse((c) => (c.userData.decorative = true));
  return o;
};

const mat = (color: number, extra: Partial<MeshStandardMaterial> = {}) => Object.assign(new MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.05 }), extra);

/** Surface texture for a collider's own mesh (tinted by the material colour), or null. */
export function colliderTexture(c: ColliderSeed): Texture | null {
  const s = c.bounds.size;
  switch (c.visualRole) {
    case 'floor':
      return tiled(floorTexture(), s.x, 1, 2);
    case 'lowwall':
    case 'barrier':
    case 'jamb':
      return tiled(concreteTexture(), s.x, s.y, 1.2);
    case 'wall':
      return c.id.startsWith('backwall') ? tiled(panelTexture(), s.x, s.y, 1.25) : tiled(concreteTexture(), Math.max(s.x, s.z), s.y, 1.2);
    case 'crate':
      return tiled(crateTexture(), s.x, s.y, Math.max(s.x, s.y));
    case 'locker':
    case 'shelf':
    case 'terminal':
      return tiled(panelTexture(), s.x, s.y, 1);
    default:
      return null;
  }
}

/** Decorative trim kept inside the collider's bounds (caps, steel edges, handles). */
export function colliderTrim(c: ColliderSeed): Object3D[] {
  const b = aabbFromBounds(c.bounds);
  const s = c.bounds.size;
  const cx = c.bounds.center.x;
  const out: Object3D[] = [];
  const box = (sx: number, sy: number, sz: number, x: number, y: number, z: number, m: MeshStandardMaterial) => {
    const mesh = new Mesh(new BoxGeometry(sx, sy, sz), m);
    mesh.position.set(x, y, z);
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    out.push(decor(mesh));
    return mesh;
  };
  const steel = mat(0x3b3f42, { metalness: 0.4, roughness: 0.55 });
  switch (c.visualRole) {
    case 'lowwall': {
      // Darker weathered cap and a scuffed footing band, both inside the wall's volume.
      box(s.x + 0.002, 0.07, s.z + 0.002, cx, b.max.y - 0.035, c.bounds.center.z, mat(0x6f6c66));
      box(s.x + 0.002, 0.12, s.z + 0.002, cx, b.min.y + 0.06, c.bounds.center.z, mat(0x5a5853));
      break;
    }
    case 'wall':
    case 'jamb': {
      if (c.id.startsWith('backwall') || c.id === 'ceiling') break;
      // Steel edge posts on the visible (front) face.
      const zf = b.max.z - 0.03;
      box(0.06, s.y, 0.06, b.min.x + 0.03, c.bounds.center.y, zf, steel);
      box(0.06, s.y, 0.06, b.max.x - 0.03, c.bounds.center.y, zf, steel);
      break;
    }
    case 'crate': {
      // Corner battens on the front face.
      const zf = b.max.z - 0.02;
      const batten = mat(0x2f3527);
      box(0.06, s.y, 0.04, b.min.x + 0.03, c.bounds.center.y, zf, batten);
      box(0.06, s.y, 0.04, b.max.x - 0.03, c.bounds.center.y, zf, batten);
      box(s.x, 0.06, 0.04, cx, b.max.y - 0.03, zf, batten);
      box(s.x, 0.06, 0.04, cx, b.min.y + 0.03, zf, batten);
      break;
    }
    case 'locker': {
      const zf = b.max.z - 0.01;
      box(0.02, s.y * 0.92, 0.02, cx, c.bounds.center.y, zf, steel);
      for (let i = 0; i < 4; i++) box(s.x * 0.3, 0.02, 0.02, cx - s.x * 0.22, b.max.y - 0.2 - i * 0.05, zf, steel);
      for (let i = 0; i < 4; i++) box(s.x * 0.3, 0.02, 0.02, cx + s.x * 0.22, b.max.y - 0.2 - i * 0.05, zf, steel);
      break;
    }
    case 'shelf': {
      const zf = b.max.z - 0.03;
      for (let i = 1; i < 4; i++) box(s.x, 0.04, s.z - 0.02, cx, b.min.y + (s.y * i) / 4, c.bounds.center.z, steel);
      box(0.05, s.y, 0.05, b.min.x + 0.025, c.bounds.center.y, zf, steel);
      box(0.05, s.y, 0.05, b.max.x - 0.025, c.bounds.center.y, zf, steel);
      break;
    }
    default:
      break;
  }
  return out;
}

/** Rendering-only facility names for the depth zones. */
const ZONE_SIGNS: Record<string, { title: string; subtitle: string; signX?: number }> = {
  // The B2 sign hangs on the approach side of the partition (its lintel would hide a centred sign).
  'zone-b-door': { title: 'SERVICE DOOR B2', subtitle: 'RECESS · KEEP CLEAR OF LANE', signX: -0.35 },
  'zone-c': { title: 'LOADING RECESS C1', subtitle: 'STAND BACK · BLIND CORNER' },
  'zone-d': { title: 'CONTROL BAY A', subtitle: 'RECESS · AUTHORISED ONLY' },
};

export const zoneSignText = (z: DepthZone): { title: string; subtitle: string; signX?: number } => ZONE_SIGNS[z.id] ?? { title: z.label, subtitle: 'RECESS · KEEP CLEAR OF LANE' };

/**
 * In-world markers for one depth zone, readable from the side view:
 *  - a hazard sign on the back wall above the zone,
 *  - hazard tape up the back wall at both ends of the zone,
 *  - a hazard-painted kerb on the floor's front face under the zone.
 */
export function zoneSignage(z: DepthZone, backWallZ: number, floorFrontZ: number): Object3D {
  const g = new Group();
  const b = aabbFromBounds(z.bounds);
  const cx = (b.min.x + b.max.x) / 2;
  const width = b.max.x - b.min.x;
  const text = zoneSignText(z);

  const signW = Math.min(1.9, width * 0.8);
  const signX = text.signX ?? cx;
  const sign = new Mesh(new PlaneGeometry(signW, signW * (192 / 512)), mat(0xffffff, { map: signTexture(z.id, text.title, text.subtitle), roughness: 0.6 }));
  sign.position.set(signX, 3.15, backWallZ + 0.02);
  sign.name = `sign-${z.id}`;
  g.add(sign);
  // Mounting brackets.
  for (const dx of [-0.6, 0.6]) {
    const bracket = new Mesh(new BoxGeometry(0.05, 0.3, 0.05), mat(0x2b2e30, { metalness: 0.4 }));
    bracket.position.set(signX + dx * (signW / 2.2), 3.15 + signW * (96 / 512) + 0.12, backWallZ + 0.03);
    g.add(bracket);
  }

  const tape = (x: number) => {
    const t = new Mesh(new PlaneGeometry(0.14, 2.3), mat(0xffffff, { map: tiled(hazardTexture(), 1, 2.3 / 0.14, 1) }));
    t.position.set(x, 1.15, backWallZ + 0.015);
    g.add(t);
  };
  tape(b.min.x + 0.07);
  tape(b.max.x - 0.07);

  const kerb = new Mesh(new PlaneGeometry(width, 0.24), mat(0xffffff, { map: tiled(hazardTexture(), width / 0.24, 1, 1) }));
  kerb.position.set(cx, -0.13, floorFrontZ + 0.005);
  g.add(kerb);
  return decor(g);
}

/** Back-wall dressing: kick plate, vents, conduit boxes and an extinguisher, all within 0.1 m of the wall. */
export function backWallDressing(minX: number, maxX: number, backWallZ: number): Object3D[] {
  const out: Object3D[] = [];
  const span = maxX - minX;
  const mid = (minX + maxX) / 2;
  const z = backWallZ + 0.03;
  const kick = new Mesh(new BoxGeometry(span, 0.42, 0.04), mat(0x3e423f));
  kick.position.set(mid, 0.21, z);
  kick.receiveShadow = true;
  out.push(decor(kick));
  for (let x = minX + 3; x < maxX - 1; x += 7.5) {
    const vent = new Mesh(new BoxGeometry(0.9, 0.5, 0.05), mat(0x2f3336, { metalness: 0.3 }));
    vent.position.set(x, 3.9, z);
    out.push(decor(vent));
    for (let i = 0; i < 4; i++) {
      const slat = new Mesh(new BoxGeometry(0.82, 0.04, 0.06), mat(0x1c1f21));
      slat.position.set(x, 3.75 + i * 0.1, z + 0.01);
      out.push(decor(slat));
    }
    const box = new Mesh(new BoxGeometry(0.34, 0.44, 0.08), mat(0x55594f));
    box.position.set(x + 2.2, 1.6, z + 0.02);
    out.push(decor(box));
    const conduit = new Mesh(new CylinderGeometry(0.025, 0.025, 2.2, 6), mat(0x45494c, { metalness: 0.4 }));
    conduit.position.set(x + 2.2, 2.92, z + 0.02);
    out.push(decor(conduit));
  }
  const ext = new Mesh(new CylinderGeometry(0.08, 0.08, 0.5, 12), mat(0xa3271f, { roughness: 0.5 }));
  ext.position.set(minX + 1.4, 0.9, z + 0.06);
  out.push(decor(ext));
  return out;
}
