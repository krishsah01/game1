/**
 * Procedural low-poly models. Soldiers are assembled from boxes so helmet,
 * head, torso, carrier, limbs, boots and rifle read clearly in silhouette.
 * Poses are driven by the simulation's mechanical anchors: the head centre
 * sits at eyeY and the rifle tip at muzzleY, so what you see is what the
 * sight and firing tests use.
 */
import {
  BackSide,
  BoxGeometry,
  Color,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Shape,
  SphereGeometry,
  type Material,
} from 'three';
import type { StanceAnchors } from '../shared/tuning.ts';

export interface SoldierTint {
  uniform: number;
  carrier: number;
  helmet: number;
  skin: number;
}

export const FRIENDLY_TINT: SoldierTint = { uniform: 0x5c6246, carrier: 0x2b2d29, helmet: 0x4a4e3c, skin: 0x9a7a62 };
export const ENEMY_TINT: SoldierTint = { uniform: 0x6b5d49, carrier: 0x2d2a26, helmet: 0x4f473b, skin: 0x8e6f58 };

const OUTLINE_COLOR = new Color(0x5fd3ff);
const FLASH_COLOR = new Color(0xffc78a);

function std(color: number, extra: Partial<MeshStandardMaterial> = {}): MeshStandardMaterial {
  const m = new MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.05 });
  Object.assign(m, extra);
  return m;
}

export class SoldierModel {
  readonly group = new Group();
  private readonly body = new Group();
  private readonly outline = new Group();
  private readonly mats: MeshStandardMaterial[] = [];
  private readonly baseColors: Color[] = [];
  private readonly parts: Record<string, Mesh> = {};
  private readonly outlineParts: Record<string, Mesh> = {};
  private walkPhase = 0;
  private facing = 1;
  private pose: { anchors: StanceAnchors; crouch: number } | null = null;
  private targetAnchors: StanceAnchors | null = null;
  private current: { eyeY: number; muzzleY: number; height: number } | null = null;

  constructor(tint: SoldierTint) {
    const mk = (name: string, geo: BoxGeometry | SphereGeometry | CylinderGeometry, color: number) => {
      const mat = std(color);
      const mesh = new Mesh(geo, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = false;
      this.mats.push(mat);
      this.baseColors.push(new Color(color));
      this.parts[name] = mesh;
      this.body.add(mesh);
      const outlineMesh = new Mesh(geo, new MeshStandardMaterial({ color: OUTLINE_COLOR, side: BackSide, emissive: OUTLINE_COLOR, emissiveIntensity: 0.9 }));
      outlineMesh.scale.setScalar(1.12);
      this.outlineParts[name] = outlineMesh;
      this.outline.add(outlineMesh);
      return mesh;
    };
    mk('bootL', new BoxGeometry(0.28, 0.12, 0.18), 0x24211d);
    mk('bootR', new BoxGeometry(0.28, 0.12, 0.18), 0x24211d);
    mk('shinL', new BoxGeometry(0.16, 0.42, 0.18), tint.uniform);
    mk('shinR', new BoxGeometry(0.16, 0.42, 0.18), tint.uniform);
    mk('thighL', new BoxGeometry(0.18, 0.44, 0.2), tint.uniform);
    mk('thighR', new BoxGeometry(0.18, 0.44, 0.2), tint.uniform);
    mk('torso', new BoxGeometry(0.34, 0.52, 0.28), tint.uniform);
    mk('carrier', new BoxGeometry(0.3, 0.4, 0.34), tint.carrier);
    mk('armBack', new BoxGeometry(0.13, 0.42, 0.14), tint.uniform);
    mk('armFront', new BoxGeometry(0.13, 0.42, 0.14), tint.uniform);
    mk('head', new BoxGeometry(0.2, 0.22, 0.22), tint.skin);
    mk('helmet', new SphereGeometry(0.15, 10, 7, 0, Math.PI * 2, 0, Math.PI * 0.55), tint.helmet);
    mk('rifle', new BoxGeometry(0.62, 0.07, 0.06), 0x4a5055);
    mk('stock', new BoxGeometry(0.2, 0.11, 0.06), 0x56473a);
    mk('mag', new BoxGeometry(0.06, 0.16, 0.05), 0x3a3f43);
    this.outline.visible = false;
    this.group.add(this.body, this.outline);
  }

  /** Immediate pose (used on reset) */
  snapPose(anchors: StanceAnchors): void {
    this.current = { eyeY: anchors.eyeY, muzzleY: anchors.muzzleY, height: anchors.height };
    this.targetAnchors = anchors;
  }

  setTarget(anchors: StanceAnchors): void {
    this.targetAnchors = anchors;
    if (!this.current) this.snapPose(anchors);
  }

  /** Interpolates the visual pose toward the mechanical anchors and lays out the parts. */
  update(dt: number, facingX: -1 | 1, moving: boolean, sprinting: boolean): void {
    if (!this.targetAnchors || !this.current) return;
    const t = this.targetAnchors;
    const k = 1 - Math.exp(-dt / 0.09);
    this.current.eyeY += (t.eyeY - this.current.eyeY) * k;
    this.current.muzzleY += (t.muzzleY - this.current.muzzleY) * k;
    this.current.height += (t.height - this.current.height) * k;
    this.facing = facingX;
    this.walkPhase += dt * (moving ? (sprinting ? 13 : 8.5) : 0);
    this.layout(this.current.eyeY, this.current.muzzleY, this.current.height, moving, t);
    this.pose = { anchors: t, crouch: 1 - Math.min(1, Math.max(0, (this.current.height - 1.06) / (1.8 - 1.06))) };
  }

  private layout(eyeY: number, muzzleY: number, height: number, moving: boolean, anchors: StanceAnchors): void {
    const f = this.facing;
    const crouch = 1 - Math.min(1, Math.max(0, (height - 1.06) / (1.8 - 1.06)));
    const p = this.parts;
    const swing = moving ? Math.sin(this.walkPhase) * 0.45 : 0;

    const place = (m: Mesh, x: number, y: number, z: number, rz = 0) => {
      m.position.set(x, y, z);
      m.rotation.set(0, 0, rz);
    };
    /** Lays a box (length axis = local Y, base length `baseLen`) along segment a→b. */
    const limb = (m: Mesh, ax: number, ay: number, bx: number, by: number, z: number, baseLen: number) => {
      const len = Math.max(0.1, Math.hypot(bx - ax, by - ay));
      m.position.set((ax + bx) / 2, (ay + by) / 2, z);
      m.rotation.set(0, 0, Math.atan2(bx - ax, -(by - ay)));
      m.scale.y = len / baseLen;
    };
    const mix = (a: number, b: number, t: number) => a + (b - a) * t;
    // Legs: blend between standing columns and a kneeling pose (front foot planted,
    // rear knee on the ground with the shin flat behind).
    const t = crouch;
    const s = swing * (1 - t);
    const hipY = mix(0.92, 0.5, t);
    const kneeF = { x: mix(0.04 + s * 0.16, 0.4, t) * f, y: mix(0.5, 0.5, t) };
    const ankleF = { x: mix(0.04 + s * 0.2, 0.42, t) * f, y: 0.1 };
    const kneeR = { x: mix(-0.02 - s * 0.16, -0.04, t) * f, y: mix(0.5, 0.1, t) };
    const ankleR = { x: mix(-0.02 - s * 0.2, -0.46, t) * f, y: 0.1 };
    limb(p.thighR!, 0, hipY, kneeF.x, kneeF.y, 0.1, 0.44);
    limb(p.shinR!, kneeF.x, kneeF.y, ankleF.x, ankleF.y, 0.1, 0.42);
    limb(p.thighL!, 0, hipY, kneeR.x, kneeR.y, -0.1, 0.44);
    limb(p.shinL!, kneeR.x, kneeR.y, ankleR.x, ankleR.y, -0.1, 0.42);
    place(p.bootR!, ankleF.x + f * 0.03, 0.06, 0.1);
    place(p.bootL!, ankleR.x - f * 0.02 * t, 0.06, -0.1);

    // Torso and plate carrier between hip and shoulders; shoulders under the head.
    const headY = eyeY + 0.03;
    const shoulderY = headY - 0.3;
    const torsoY = (hipY + shoulderY) / 2 + 0.02;
    const torsoH = Math.max(0.32, shoulderY - hipY + 0.14);
    p.torso!.scale.y = torsoH / 0.52;
    place(p.torso!, f * 0.01, torsoY, 0);
    p.carrier!.scale.y = Math.min(1, torsoH / 0.52);
    place(p.carrier!, f * 0.04, torsoY + 0.02, 0);

    // Head + helmet.
    place(p.head!, f * 0.04, headY, 0);
    place(p.helmet!, f * 0.04, headY + 0.08, 0);

    // Rifle: tip at (muzzleForward, muzzleY); the stock ends just behind the torso.
    const tipX = f * anchors.muzzleForward;
    const rifleLen = 0.62;
    place(p.rifle!, tipX - f * rifleLen * 0.5, muzzleY, 0.17);
    place(p.stock!, tipX - f * (rifleLen + 0.08), muzzleY - 0.015, 0.17);
    place(p.mag!, tipX - f * 0.34, muzzleY - 0.1, 0.17);

    // Arms: hands on the foregrip and the pistol grip, drawn in front of the torso.
    const armFromShoulder = (m: Mesh, sx: number, sy: number, gx: number, gy: number, z: number) => {
      const len = Math.max(0.24, Math.hypot(gx - sx, gy - sy));
      const ang = Math.atan2(gx - sx, -(gy - sy));
      m.position.set((sx + gx) / 2, (sy + gy) / 2, z);
      m.rotation.set(0, 0, ang);
      m.scale.y = len / 0.42;
    };
    armFromShoulder(p.armFront!, f * 0.06, shoulderY - 0.02, tipX - f * 0.28, muzzleY - 0.07, 0.2);
    armFromShoulder(p.armBack!, f * -0.08, shoulderY - 0.02, tipX - f * 0.52, muzzleY - 0.12, 0.19);

    // Mirror the outline copy.
    for (const [name, mesh] of Object.entries(this.parts)) {
      const o = this.outlineParts[name]!;
      o.position.copy(mesh.position);
      o.rotation.copy(mesh.rotation);
      o.scale.copy(mesh.scale).multiplyScalar(1.1);
    }
  }

  setOutline(on: boolean): void {
    this.outline.visible = on;
  }

  setFlash(on: boolean): void {
    for (let i = 0; i < this.mats.length; i++) {
      const m = this.mats[i]!;
      if (on) m.emissive.copy(FLASH_COLOR), (m.emissiveIntensity = 0.7);
      else m.emissive.setRGB(0, 0, 0), (m.emissiveIntensity = 0);
    }
  }

  /** Ghost style for developer view (unobserved truth). */
  setGhost(on: boolean): void {
    for (let i = 0; i < this.mats.length; i++) {
      const m = this.mats[i]!;
      m.transparent = on;
      m.opacity = on ? 0.28 : 1;
      m.wireframe = on;
      m.color.copy(on ? new Color(0xff5fa8) : this.baseColors[i]!);
      m.depthWrite = !on;
      m.needsUpdate = true;
    }
    this.outline.visible = this.outline.visible && !on;
  }

  setOpacity(alpha: number): void {
    for (const m of this.mats) {
      m.transparent = alpha < 1;
      m.opacity = alpha;
      m.depthWrite = alpha >= 1;
    }
  }

  get currentPose() {
    return this.pose;
  }

  dispose(): void {
    for (const mesh of Object.values(this.parts)) {
      mesh.geometry.dispose();
      (mesh.material as Material).dispose();
    }
    for (const mesh of Object.values(this.outlineParts)) (mesh.material as Material).dispose();
  }
}

/** Dropped equipment bag. */
export function makeBag(): Group {
  const g = new Group();
  const body = new Mesh(new BoxGeometry(0.6, 0.4, 0.4), std(0x4e5240));
  body.position.y = 0.2;
  body.castShadow = true;
  const flap = new Mesh(new BoxGeometry(0.62, 0.08, 0.42), std(0x3b3e31));
  flap.position.y = 0.44;
  const strap = new Mesh(new BoxGeometry(0.05, 0.3, 0.05), std(0x2a2a26));
  strap.position.set(0, 0.55, 0.1);
  strap.rotation.z = 0.6;
  g.add(body, flap, strap);
  return g;
}

/** Wall-mounted recon camera. */
export function makeCameraDevice(): Group {
  const g = new Group();
  const bracket = new Mesh(new BoxGeometry(0.08, 0.3, 0.08), std(0x2a2c2e));
  bracket.position.y = 0.1;
  const body = new Mesh(new BoxGeometry(0.32, 0.14, 0.14), std(0x33363a));
  const lens = new Mesh(new CylinderGeometry(0.05, 0.06, 0.08, 10), std(0x111416, { metalness: 0.3, roughness: 0.4 }));
  lens.rotation.z = Math.PI / 2;
  lens.position.x = -0.19;
  const led = new Mesh(new SphereGeometry(0.025, 8, 8), new MeshStandardMaterial({ color: 0x55ffcc, emissive: 0x33ffcc, emissiveIntensity: 2 }));
  led.position.set(0.1, 0.09, 0.06);
  led.name = 'led';
  g.add(bracket, body, lens, led);
  return g;
}

/** Jersey barrier profile (cross-section in the YZ plane) extruded along X. */
export function makeBarrierGeometry(length: number, height: number, depth: number): ExtrudeGeometry {
  const half = depth / 2;
  const s = new Shape();
  s.moveTo(-half, 0);
  s.lineTo(half, 0);
  s.lineTo(half, height * 0.22);
  s.lineTo(half * 0.45, height * 0.6);
  s.lineTo(half * 0.4, height);
  s.lineTo(-half * 0.4, height);
  s.lineTo(-half * 0.45, height * 0.6);
  s.lineTo(-half, height * 0.22);
  s.closePath();
  const geo = new ExtrudeGeometry(s, { depth: length, bevelEnabled: false });
  // Shape lives in (z, y); extrusion runs along local +Z. Rotate so extrusion maps to world X.
  geo.rotateY(Math.PI / 2);
  geo.translate(-length / 2, 0, 0);
  return geo;
}
