/**
 * Procedural low-poly models. Soldiers are assembled from boxes so helmet,
 * head, torso, carrier, limbs, boots and rifle read clearly in silhouette.
 * v0.2.4 adds kit detail for a richer silhouette at every depth: two-bone
 * arms with elbows and gloves, neck, goggles and NVG mount, chest pouches,
 * back pack, belt, knee pads, boot soles, rifle handguard/optic/muzzle device
 * and a team marker on the upper arm.
 * Poses are driven by the simulation's mechanical anchors: the head centre
 * sits at eyeY and the rifle tip at the muzzle anchor (pivot + rest offset
 * rotated by the aim pitch), so what you see is what the sight and firing
 * tests use. Standing, kneeling and prone are blends of one skeleton.
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
import { WEAPONS, type WeaponSpec } from '../shared/weapons.ts';

type WeaponModel = WeaponSpec['model'];

export interface SoldierTint {
  uniform: number;
  carrier: number;
  helmet: number;
  skin: number;
  /** Team marker band on the upper arm. */
  marker: number;
}

export const FRIENDLY_TINT: SoldierTint = { uniform: 0x5c6246, carrier: 0x2b2d29, helmet: 0x4a4e3c, skin: 0x9a7a62, marker: 0x3f8fbf };
export const ENEMY_TINT: SoldierTint = { uniform: 0x6b5d49, carrier: 0x2d2a26, helmet: 0x4f473b, skin: 0x8e6f58, marker: 0xa8402f };

/** Upper arm and forearm length (two-bone arm). */
const ARM_BONE = 0.29;

const OUTLINE_COLOR = new Color(0x5fd3ff);
const FLASH_COLOR = new Color(0xffc78a);

function std(color: number, extra: Partial<MeshStandardMaterial> = {}): MeshStandardMaterial {
  const m = new MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.05 });
  Object.assign(m, extra);
  return m;
}

export interface SoldierPose {
  /** Mechanical aim pitch in radians (positive = up). The arms and rifle swing around the pivot by this angle. */
  aimPitch: number;
  /** 0..1 while a vault is in progress (legs tuck), null otherwise. */
  vaultProgress: number | null;
  /** Signed z offset of the eye while peeking from depth cover; the head and shoulders lean with it. */
  peekLean?: number;
}

interface Pt {
  x: number;
  y: number;
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
  private pose: { anchors: StanceAnchors; crouch: number; prone: number } | null = null;
  private targetAnchors: StanceAnchors | null = null;
  private current: StanceAnchors | null = null;
  private aimPitchTarget = 0;
  private aimPitch = 0;
  private vaultProgress: number | null = null;
  private peekLeanTarget = 0;
  private peekLean = 0;
  private weapon: WeaponModel = WEAPONS.CARBINE.model;
  private slungWeapon: WeaponModel | null = null;

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
    mk('soleL', new BoxGeometry(0.3, 0.035, 0.19), 0x121212);
    mk('soleR', new BoxGeometry(0.3, 0.035, 0.19), 0x121212);
    mk('kneeL', new BoxGeometry(0.11, 0.12, 0.2), 0x2b2d29);
    mk('kneeR', new BoxGeometry(0.11, 0.12, 0.2), 0x2b2d29);
    mk('shinL', new BoxGeometry(0.16, 0.42, 0.18), tint.uniform);
    mk('shinR', new BoxGeometry(0.16, 0.42, 0.18), tint.uniform);
    mk('thighL', new BoxGeometry(0.18, 0.44, 0.2), tint.uniform);
    mk('thighR', new BoxGeometry(0.18, 0.44, 0.2), tint.uniform);
    mk('torso', new BoxGeometry(0.34, 0.52, 0.28), tint.uniform);
    mk('carrier', new BoxGeometry(0.3, 0.4, 0.34), tint.carrier);
    mk('pouches', new BoxGeometry(0.09, 0.16, 0.3), lighten(tint.carrier, 0.12));
    mk('pack', new BoxGeometry(0.14, 0.32, 0.26), lighten(tint.carrier, 0.06));
    mk('belt', new BoxGeometry(0.34, 0.08, 0.3), 0x2a2824);
    mk('neck', new BoxGeometry(0.1, 0.1, 0.12), tint.skin);
    mk('upperArmB', new BoxGeometry(0.12, ARM_BONE, 0.13), tint.uniform);
    mk('foreArmB', new BoxGeometry(0.11, ARM_BONE, 0.12), tint.uniform);
    mk('upperArmF', new BoxGeometry(0.12, ARM_BONE, 0.13), tint.uniform);
    mk('foreArmF', new BoxGeometry(0.11, ARM_BONE, 0.12), tint.uniform);
    mk('marker', new BoxGeometry(0.13, 0.06, 0.14), tint.marker);
    mk('gloveB', new BoxGeometry(0.08, 0.08, 0.08), 0x222220);
    mk('gloveF', new BoxGeometry(0.08, 0.08, 0.08), 0x222220);
    mk('head', new BoxGeometry(0.2, 0.22, 0.22), tint.skin);
    mk('goggles', new BoxGeometry(0.05, 0.05, 0.2), 0x1a1d1f);
    mk('helmet', new SphereGeometry(0.15, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), tint.helmet);
    mk('nvg', new BoxGeometry(0.07, 0.06, 0.07), 0x2a2d2f);
    mk('rifle', new BoxGeometry(0.62, 0.07, 0.06), 0x4a5055);
    mk('handguard', new BoxGeometry(0.24, 0.085, 0.07), 0x2f3438);
    mk('optic', new BoxGeometry(0.12, 0.06, 0.05), 0x1c1f22);
    mk('muzzleDev', new BoxGeometry(0.06, 0.045, 0.045), 0x1c1f22);
    mk('stock', new BoxGeometry(0.2, 0.11, 0.06), 0x56473a);
    mk('mag', new BoxGeometry(0.06, 0.16, 0.05), 0x3a3f43);
    mk('slung', new BoxGeometry(0.62, 0.06, 0.05), 0x3c4246);
    this.outline.visible = false;
    this.group.add(this.body, this.outline);
  }

  /** Immediate pose (used on reset) */
  snapPose(anchors: StanceAnchors): void {
    this.current = { ...anchors };
    this.targetAnchors = anchors;
  }

  setTarget(anchors: StanceAnchors): void {
    this.targetAnchors = anchors;
    if (!this.current) this.snapPose(anchors);
  }

  /** Weapon in hand and, optionally, a long gun slung on the back (primary while the sidearm is out). */
  setWeapon(inHand: WeaponModel, slung: WeaponModel | null = null): void {
    this.weapon = inHand;
    this.slungWeapon = slung;
  }

  /** Aim pitch and vault progress come from the simulation; the visual pitch is lightly smoothed. */
  setPose(pose: SoldierPose): void {
    this.aimPitchTarget = pose.aimPitch;
    this.vaultProgress = pose.vaultProgress;
    this.peekLeanTarget = pose.peekLean ?? 0;
  }

  /** Interpolates the visual pose toward the mechanical anchors and lays out the parts. */
  update(dt: number, facingX: -1 | 1, moving: boolean, sprinting: boolean): void {
    if (!this.targetAnchors || !this.current) return;
    const t = this.targetAnchors;
    const c = this.current;
    const k = 1 - Math.exp(-dt / 0.09);
    c.eyeY += (t.eyeY - c.eyeY) * k;
    c.muzzleY += (t.muzzleY - c.muzzleY) * k;
    c.height += (t.height - c.height) * k;
    c.eyeForward += (t.eyeForward - c.eyeForward) * k;
    c.muzzleForward += (t.muzzleForward - c.muzzleForward) * k;
    c.pivotForward += (t.pivotForward - c.pivotForward) * k;
    c.pivotY += (t.pivotY - c.pivotY) * k;
    this.aimPitch += (this.aimPitchTarget - this.aimPitch) * (1 - Math.exp(-dt / 0.06));
    this.peekLean += (this.peekLeanTarget - this.peekLean) * k;
    this.facing = facingX;
    const prone = clamp01((1.06 - c.height) / (1.06 - 0.5));
    this.walkPhase += dt * (moving ? (sprinting ? 13 : prone > 0.5 ? 5 : 8.5) : 0);
    this.layout(c, moving, prone);
    this.pose = { anchors: t, crouch: 1 - clamp01((c.height - 1.06) / (1.8 - 1.06)), prone };
  }

  private layout(a: StanceAnchors, moving: boolean, prone: number): void {
    const f = this.facing;
    const crouch = 1 - clamp01((a.height - 1.06) / (1.8 - 1.06));
    const p = this.parts;
    const swing = moving ? Math.sin(this.walkPhase) * 0.45 : 0;
    const tuck = this.vaultProgress === null ? 0 : Math.sin(Math.PI * this.vaultProgress);

    const place = (m: Mesh, x: number, y: number, z: number, rz = 0) => {
      m.position.set(x, y, z);
      m.rotation.set(0, 0, rz);
      m.scale.y = 1;
    };
    /** Lays a box (length axis = local Y, base length `baseLen`) along segment a→b. */
    const limb = (m: Mesh, from: Pt, to: Pt, z: number, baseLen: number) => {
      const len = Math.max(0.1, Math.hypot(to.x - from.x, to.y - from.y));
      m.position.set((from.x + to.x) / 2, (from.y + to.y) / 2, z);
      m.rotation.set(0, 0, Math.atan2(to.x - from.x, -(to.y - from.y)));
      m.scale.y = len / baseLen;
    };
    const mix = (u: number, v: number, k: number) => u + (v - u) * k;
    const mixPt = (u: Pt, v: Pt, k: number): Pt => ({ x: mix(u.x, v.x, k), y: mix(u.y, v.y, k) });

    // ---- upright skeleton: blend between standing columns and a kneeling pose.
    const tc = crouch;
    const sw = swing * (1 - tc);
    const headY = a.eyeY + 0.03;
    const up = {
      hip: { x: 0, y: mix(0.92, 0.5, tc) },
      shoulder: { x: f * 0.01, y: headY - 0.3 },
      head: { x: f * (a.eyeForward - 0.08), y: headY },
      kneeF: { x: mix(0.04 + sw * 0.16, 0.4, tc) * f, y: 0.5 + tuck * 0.3 },
      ankleF: { x: mix(0.04 + sw * 0.2, 0.42, tc) * f, y: 0.1 + tuck * 0.35 },
      kneeR: { x: mix(-0.02 - sw * 0.16, -0.04, tc) * f, y: mix(0.5, 0.1, tc) + tuck * 0.3 },
      ankleR: { x: mix(-0.02 - sw * 0.2, -0.46, tc) * f, y: 0.1 + tuck * 0.35 },
    };
    // ---- prone skeleton: head and shoulders forward (inside the collider), legs trailing behind.
    const crawl = moving ? Math.sin(this.walkPhase) * 0.08 : 0;
    const pr = {
      hip: { x: -f * 0.46, y: 0.22 },
      shoulder: { x: f * 0.0, y: 0.33 },
      head: { x: f * (a.eyeForward - 0.03), y: a.eyeY + 0.03 },
      kneeF: { x: -f * (0.86 + crawl), y: 0.17 },
      ankleF: { x: -f * (1.26 + crawl), y: 0.13 },
      kneeR: { x: -f * (0.9 - crawl), y: 0.18 },
      ankleR: { x: -f * (1.3 - crawl), y: 0.13 },
    };
    const hip = mixPt(up.hip, pr.hip, prone);
    const shoulder = mixPt(up.shoulder, pr.shoulder, prone);
    const head = mixPt(up.head, pr.head, prone);
    const kneeF = mixPt(up.kneeF, pr.kneeF, prone);
    const ankleF = mixPt(up.ankleF, pr.ankleF, prone);
    const kneeR = mixPt(up.kneeR, pr.kneeR, prone);
    const ankleR = mixPt(up.ankleR, pr.ankleR, prone);

    limb(p.thighR!, hip, kneeF, 0.1, 0.44);
    limb(p.shinR!, kneeF, ankleF, 0.1, 0.42);
    limb(p.thighL!, hip, kneeR, -0.1, 0.44);
    limb(p.shinL!, kneeR, ankleR, -0.1, 0.42);
    const bootRot = prone * f * 1.1;
    place(p.bootR!, ankleF.x + f * 0.03 * (1 - prone), 0.06 + prone * 0.06, 0.1, bootRot);
    place(p.bootL!, ankleR.x - f * 0.02 * tc * (1 - prone), 0.06 + prone * 0.06, -0.1, bootRot);
    // Soles sit at the bottom of the boot (rotated with it when prone).
    const soleOff = (m: Mesh): Pt => ({ x: m.position.x + Math.sin(bootRot) * 0.0425, y: m.position.y - Math.cos(bootRot) * 0.0425 });
    const sR = soleOff(p.bootR!);
    const sL = soleOff(p.bootL!);
    place(p.soleR!, sR.x, sR.y, 0.1, bootRot);
    place(p.soleL!, sL.x, sL.y, -0.1, bootRot);
    place(p.kneeR!, kneeF.x + f * 0.05 * (1 - prone), kneeF.y - prone * 0.05, 0.1);
    place(p.kneeL!, kneeR.x + f * 0.05 * (1 - prone), kneeR.y - prone * 0.05, -0.1);

    // Torso and plate carrier follow the hip→shoulder segment (vertical upright, horizontal prone).
    // A depth-cover peek leans the head out to the mechanical eye; the shoulders follow part way.
    const lean = this.peekLean;
    limb(p.torso!, { x: hip.x, y: hip.y - 0.05 }, { x: shoulder.x, y: shoulder.y + 0.09 }, lean * 0.3, 0.52);
    limb(p.carrier!, mixPt(hip, shoulder, 0.3), mixPt(hip, shoulder, 0.97), 0.02 + lean * 0.3, 0.4);
    // Kit on the torso: chest pouches in front, pack behind, belt at the hip. `n` points out of the chest.
    const tl = Math.max(1e-6, Math.hypot(shoulder.x - hip.x, shoulder.y - hip.y));
    const d: Pt = { x: (shoulder.x - hip.x) / tl, y: (shoulder.y - hip.y) / tl };
    const n: Pt = { x: d.y * f, y: -d.x * f };
    const onTorso = (k: number, out: number): Pt => ({ x: hip.x + (shoulder.x - hip.x) * k + n.x * out, y: hip.y + (shoulder.y - hip.y) * k + n.y * out });
    limb(p.pouches!, onTorso(0.32, 0.2), onTorso(0.62, 0.2), 0.02 + lean * 0.3, 0.16);
    limb(p.pack!, onTorso(0.4, -0.22), onTorso(0.95, -0.22), lean * 0.3, 0.32);
    limb(p.belt!, onTorso(-0.06, 0), onTorso(0.08, 0), lean * 0.2, 0.08);

    // Head + helmet + neck + face kit.
    place(p.head!, head.x, head.y, lean);
    place(p.helmet!, head.x, head.y + 0.08, lean);
    limb(p.neck!, mixPt(shoulder, head, 0.45), mixPt(shoulder, head, 0.75), lean * 0.65, 0.1);
    place(p.goggles!, head.x + f * 0.09, head.y + 0.03, lean);
    place(p.nvg!, head.x + f * 0.12, head.y + 0.15, lean);

    // Rifle: swings around the pivot by the aim pitch; the tip is the mechanical muzzle anchor.
    const pivot: Pt = { x: f * a.pivotForward, y: a.pivotY };
    const ox = a.muzzleForward - a.pivotForward;
    const oy = a.muzzleY - a.pivotY;
    const restLen = Math.hypot(ox, oy);
    const theta = this.aimPitch + Math.atan2(oy, ox);
    const u: Pt = { x: f * Math.cos(theta), y: Math.sin(theta) };
    const down: Pt = { x: f * u.y, y: -f * u.x }; // perpendicular, toward the ground when level
    const along = (d: number, drop = 0): Pt => ({ x: pivot.x + u.x * d + down.x * drop, y: pivot.y + u.y * d + down.y * drop });
    const tip = along(restLen);
    const wm = this.weapon;
    const pistol = wm.grip === 'pistol';
    const rifleLen = wm.length;
    const rz = Math.atan2(u.y, u.x);
    const rifleZ = 0.17 - prone * 0.05;
    const rifleC = along(restLen - rifleLen * 0.5);
    place(p.rifle!, rifleC.x, rifleC.y, rifleZ, rz);
    p.rifle!.scale.x = rifleLen / 0.62;
    const stockC = along(restLen - rifleLen - 0.08, 0.015);
    place(p.stock!, stockC.x, stockC.y, rifleZ, rz);
    p.stock!.visible = wm.stock;
    // Rifle magazine ahead of the trigger; a pistol's grip/magazine sits under the slide's rear.
    const magC = pistol ? along(restLen - rifleLen * 0.8, 0.09) : along(restLen - Math.min(0.34, rifleLen * 0.6), 0.1);
    place(p.mag!, magC.x, magC.y, rifleZ, rz + (pistol ? f * 0.25 : 0));
    const guardC = along(restLen - 0.16);
    place(p.handguard!, guardC.x, guardC.y, rifleZ, rz);
    p.handguard!.visible = rifleLen >= 0.4;
    const opticC = along(restLen - Math.min(0.42, rifleLen * 0.6), -0.065);
    place(p.optic!, opticC.x, opticC.y, rifleZ, rz);
    p.optic!.visible = wm.optic !== 'none';
    p.optic!.scale.x = wm.optic === 'scope' ? 2.2 : 1;
    const muzzleC = along(restLen - 0.02);
    place(p.muzzleDev!, muzzleC.x, muzzleC.y, rifleZ, rz);
    p.muzzleDev!.visible = !pistol;

    // Arms: hands on the foregrip and the pistol grip (a pistol is held two-handed at the grip).
    const handFront = pistol ? along(restLen - rifleLen * 0.65, 0.07) : along(restLen - rifleLen * 0.45, 0.07);
    const handBack = pistol ? along(restLen - rifleLen * 0.85, 0.1) : along(restLen - rifleLen * 0.84, 0.12);
    /** Two-bone arm: the elbow bends down/out so a short reach folds instead of shrinking. */
    const arm = (upper: Mesh, fore: Mesh, glove: Mesh, from: Pt, to: Pt, z: number): Pt => {
      const dist = Math.max(1e-6, Math.hypot(to.x - from.x, to.y - from.y));
      const dir: Pt = { x: (to.x - from.x) / dist, y: (to.y - from.y) / dist };
      const half = Math.min(dist, 2 * ARM_BONE - 1e-3) / 2;
      const bend = Math.sqrt(Math.max(0, ARM_BONE * ARM_BONE - half * half));
      const p1: Pt = { x: -dir.y, y: dir.x };
      const perp = p1.y <= 0 ? p1 : { x: dir.y, y: -dir.x };
      const elbow: Pt = { x: from.x + dir.x * half + perp.x * bend, y: from.y + dir.y * half + perp.y * bend };
      limb(upper, from, elbow, z, ARM_BONE);
      limb(fore, elbow, to, z + 0.005, ARM_BONE);
      place(glove, to.x, to.y, z + 0.01);
      return elbow;
    };
    const shoulderF: Pt = { x: shoulder.x + f * 0.05, y: shoulder.y - 0.02 };
    const elbowF = arm(p.upperArmF!, p.foreArmF!, p.gloveF!, shoulderF, handFront, 0.2);
    arm(p.upperArmB!, p.foreArmB!, p.gloveB!, { x: shoulder.x - f * 0.09, y: shoulder.y - 0.02 }, handBack, 0.19);
    limb(p.marker!, mixPt(shoulderF, elbowF, 0.3), mixPt(shoulderF, elbowF, 0.5), 0.21, 0.06);
    void tip;

    // A long gun slung diagonally across the back while the sidearm is in hand.
    const sl = this.slungWeapon;
    p.slung!.visible = sl !== null;
    if (sl) {
      const c = onTorso(0.6, -0.17);
      place(p.slung!, c.x, c.y, -0.05 + lean * 0.3, Math.atan2(d.y, d.x) + f * 0.55);
      p.slung!.scale.x = sl.length / 0.62;
    }

    // Mirror the outline copy.
    for (const [name, mesh] of Object.entries(this.parts)) {
      const o = this.outlineParts[name]!;
      o.position.copy(mesh.position);
      o.rotation.copy(mesh.rotation);
      o.scale.copy(mesh.scale).multiplyScalar(1.1);
      o.visible = mesh.visible;
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

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

/** Blends a hex colour toward white by `k` (0..1). */
function lighten(hex: number, k: number): number {
  return new Color(hex).lerp(new Color(0xffffff), k).getHex();
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

/**
 * Recon camera: a bracket fixed to its surface and a head whose lens (local
 * -X) points along the camera's facing. Call `orientCameraDevice` to aim it.
 */
export function makeCameraDevice(tint = 0x33363a): Group {
  const g = new Group();
  const bracket = new Mesh(new BoxGeometry(0.06, 0.14, 0.06), std(0x2a2c2e));
  bracket.name = 'bracket';
  const head = new Group();
  head.name = 'head';
  const body = new Mesh(new BoxGeometry(0.3, 0.13, 0.14), std(tint));
  body.castShadow = true;
  const lens = new Mesh(new CylinderGeometry(0.05, 0.06, 0.08, 10), std(0x111416, { metalness: 0.3, roughness: 0.4 }));
  lens.rotation.z = Math.PI / 2;
  lens.position.x = -0.18;
  const led = new Mesh(new SphereGeometry(0.025, 8, 8), new MeshStandardMaterial({ color: 0x55ffcc, emissive: 0x33ffcc, emissiveIntensity: 2 }));
  led.position.set(0.09, 0.08, 0.06);
  led.name = 'led';
  // Operator gun slung under the body, barrel along the lens axis.
  const barrel = new Mesh(new CylinderGeometry(0.018, 0.018, 0.26, 8), std(0x15181a, { metalness: 0.5, roughness: 0.4 }));
  barrel.rotation.z = Math.PI / 2;
  barrel.position.set(-0.08, -0.09, 0);
  head.add(body, lens, led, barrel);
  g.add(bracket, head);
  return g;
}

/** Points the head along `facing` (X/Y plane) and runs the bracket from the head to the mount surface. */
export function orientCameraDevice(g: Group, facing: { x: number; y: number }, mountNormal: { x: number; y: number }): void {
  const head = g.getObjectByName('head');
  const bracket = g.getObjectByName('bracket');
  if (head) {
    const pitch = Math.atan2(facing.y, Math.abs(facing.x));
    head.rotation.set(0, facing.x > 0 ? Math.PI : 0, -pitch);
  }
  if (bracket) {
    // Bracket centre halfway to the surface, long axis along the normal.
    bracket.position.set(-mountNormal.x * 0.09, -mountNormal.y * 0.09, 0);
    bracket.rotation.set(0, 0, Math.abs(mountNormal.x) > 0.5 ? Math.PI / 2 : 0);
  }
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
