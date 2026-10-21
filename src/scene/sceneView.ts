/**
 * Three.js presentation of the simulation.
 *
 * Reads ONLY a Presentation snapshot (never raw simulation truth), so the
 * player view cannot leak hidden actors. The same collider seeds that drive
 * gameplay create the visible architecture. Decorative meshes are flagged
 * `userData.decorative = true` and have no gameplay role.
 *
 * Camera: fixed orthographic, on +Z, looking down -Z (see cameraRig.ts).
 */
import {
  ACESFilmicToneMapping,
  BoxGeometry,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  EdgesGeometry,
  Float32BufferAttribute,
  Group,
  HemisphereLight,
  Line,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  OrthographicCamera,
  PCFShadowMap,
  PointLight,
  Scene,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
  type Material,
  type Object3D,
} from 'three';
import { aabbFromBounds } from '../shared/geometry.ts';
import { depthWord, LANE_HALF_WIDTH } from '../shared/tuning.ts';
import type { Bounds, ColliderSeed, SceneSeed } from '../shared/types.ts';
import type { EntityView, Presentation, ViewMode } from '../simulation/world.ts';
import { fitOrthographic, followCenterX } from './cameraRig.ts';
import { LabelLayer } from './labels.ts';
import { ENEMY_TINT, FRIENDLY_TINT, makeBag, makeBarrierGeometry, makeCameraDevice, SoldierModel } from './models.ts';

export interface FrameOptions {
  mode: ViewMode;
  showRays: boolean;
  showColliders: boolean;
  showCones: boolean;
  showZones: boolean;
}

const VIEW_HEIGHT = 8.6;
const VIEW_CENTER_Y = 3.15;
const CYAN = 0x5fd3ff;
const AMBER = 0xffb454;
const DIM_TARGET = new Color(0x2c3035);

interface StaticEntry {
  id: string;
  mesh: Mesh;
  base: Color;
  dim: Color;
  lit: number;
  materials: MeshStandardMaterial[];
}

interface ActorEntry {
  kind: EntityView['kind'];
  object: Object3D;
  soldier: SoldierModel | null;
  marker: Mesh | null;
  lastSeenFrame: number;
  fadeStart: number | null;
  frozenAt: Vector3;
}

function disposeObject(obj: Object3D): void {
  obj.traverse((o) => {
    const m = o as Mesh;
    if (m.geometry) m.geometry.dispose();
    const mat = m.material as Material | Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
    else mat?.dispose();
  });
}

export class SceneView {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera = new OrthographicCamera(-10, 10, 5, -5, 0.1, 100);
  readonly labels: LabelLayer;

  private seed: SceneSeed | null = null;
  private staticGroup = new Group();
  private decorGroup = new Group();
  private overlayGroup = new Group();
  private dynamicGroup = new Group();
  private statics: StaticEntry[] = [];
  private actors = new Map<string, ActorEntry>();
  private player: SoldierModel;
  private cameraDevice: Group;
  private cameraLed: Mesh | null = null;
  private terminalScreen: MeshStandardMaterial | null = null;
  private smokeGroup = new Group();
  private smokeMaterials: MeshStandardMaterial[] = [];

  // Developer overlays
  private eyeMarker: Mesh;
  private muzzleMarker: Mesh;
  private sightLines: LineSegments;
  private fireLine: Line;
  private fireHit: Mesh;
  private playerCone: Mesh;
  private cameraCone: Mesh;
  private colliderWire = new Group();
  private zoneGroup = new Group();
  private captureWire: LineSegments | null = null;
  private tracerPool: Line[] = [];
  private impactPool: Mesh[] = [];

  private followX = 0;
  private frameIndex = 0;
  private width = 1;
  private height = 1;
  private wallClock = 0;

  constructor(
    readonly canvas: HTMLCanvasElement,
    labelRoot: HTMLElement,
  ) {
    this.renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFShadowMap;
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.scene.background = new Color(0x15181b);
    this.labels = new LabelLayer(labelRoot);

    this.scene.add(this.staticGroup, this.decorGroup, this.dynamicGroup, this.overlayGroup, this.smokeGroup, this.colliderWire, this.zoneGroup);

    // Lights: hemisphere fill + one shadow-casting key from the front-top-left.
    this.scene.add(new HemisphereLight(0x9aa6b4, 0x26262a, 0.75));
    const key = new DirectionalLight(0xe6edf5, 1.35);
    key.position.set(-6, 14, 18);
    key.target.position.set(0, 0, -2);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -26;
    key.shadow.camera.right = 26;
    key.shadow.camera.top = 12;
    key.shadow.camera.bottom = -6;
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 70;
    key.shadow.bias = -0.0006;
    key.shadow.normalBias = 0.02;
    this.scene.add(key, key.target);

    this.player = new SoldierModel(FRIENDLY_TINT);
    this.dynamicGroup.add(this.player.group);
    this.cameraDevice = makeCameraDevice();
    this.cameraLed = this.cameraDevice.getObjectByName('led') as Mesh | null;
    this.dynamicGroup.add(this.cameraDevice);

    // Overlay primitives.
    this.eyeMarker = new Mesh(new SphereGeometry(0.06, 10, 10), new MeshBasicMaterial({ color: CYAN }));
    this.muzzleMarker = new Mesh(new SphereGeometry(0.06, 10, 10), new MeshBasicMaterial({ color: AMBER }));
    this.sightLines = new LineSegments(new BufferGeometry(), new LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.95 }));
    this.fireLine = new Line(new BufferGeometry(), new LineBasicMaterial({ color: AMBER, transparent: true, opacity: 0.9 }));
    this.fireHit = new Mesh(new SphereGeometry(0.07, 10, 10), new MeshBasicMaterial({ color: AMBER }));
    this.playerCone = new Mesh(new BufferGeometry(), new MeshBasicMaterial({ color: CYAN, transparent: true, opacity: 0.07, side: DoubleSide, depthWrite: false }));
    this.cameraCone = new Mesh(new BufferGeometry(), new MeshBasicMaterial({ color: 0x7fe7d8, wireframe: true, transparent: true, opacity: 0.35, depthWrite: false }));
    this.overlayGroup.add(this.eyeMarker, this.muzzleMarker, this.sightLines, this.fireLine, this.fireHit, this.playerCone, this.cameraCone);
    for (let i = 0; i < 8; i++) {
      const line = new Line(new BufferGeometry(), new LineBasicMaterial({ color: 0xffd18a, transparent: true, opacity: 0 }));
      line.visible = false;
      this.tracerPool.push(line);
      const impact = new Mesh(new SphereGeometry(0.09, 8, 8), new MeshBasicMaterial({ color: 0xffe2b0, transparent: true, opacity: 0 }));
      impact.visible = false;
      this.impactPool.push(impact);
      this.scene.add(line, impact);
    }

    this.resize();
  }

  // ------------------------------------------------------------------ build

  setScene(seed: SceneSeed): void {
    this.seed = seed;
    this.clearGroup(this.staticGroup);
    this.clearGroup(this.decorGroup);
    this.clearGroup(this.colliderWire);
    this.clearGroup(this.zoneGroup);
    this.clearGroup(this.smokeGroup);
    this.statics = [];
    this.smokeMaterials = [];
    this.terminalScreen = null;
    for (const [id, entry] of this.actors) {
      this.dynamicGroup.remove(entry.object);
      entry.soldier ? entry.soldier.dispose() : disposeObject(entry.object);
      this.actors.delete(id);
    }
    this.labels.prune('', new Set());

    for (const c of seed.colliders) this.buildStatic(c);
    this.buildDecor(seed);
    this.buildZones(seed);
    this.buildSmoke(seed.smokeBounds);
    this.player.snapPose({ eyeY: 1.62, muzzleY: 1.38, height: 1.8, eyeForward: 0.12, muzzleForward: 0.62 });
    const playerSeed = seed.entities.find((e) => e.kind === 'PLAYER');
    this.followX = followCenterX(playerSeed?.position.x ?? 0, seed.roomMinX, seed.roomMaxX, this.halfWidth());

    // Camera device orientation: lens (-X local) toward lookAt in XZ.
    const r = seed.recon;
    const dir = new Vector3(r.lookAt.x - r.position.x, 0, r.lookAt.z - r.position.z).normalize();
    this.cameraDevice.position.set(r.position.x, r.position.y - 0.1, r.position.z);
    this.cameraDevice.rotation.set(0, Math.atan2(dir.z, -dir.x), 0);
    this.buildCameraCone(seed);

    for (const s of seed.stationLabels) this.labels.upsert(`station-${s.id}`, 'station', s.label, { x: s.x, y: 4.55, z: 0 });
  }

  private clearGroup(g: Group): void {
    for (const child of [...g.children]) {
      g.remove(child);
      disposeObject(child);
    }
  }

  private buildStatic(c: ColliderSeed): void {
    const b = c.bounds;
    let geometry: BufferGeometry;
    let color: number;
    let translucent = false;
    switch (c.visualRole) {
      case 'floor':
        geometry = new BoxGeometry(b.size.x, b.size.y, b.size.z);
        color = 0x4a4d4b;
        break;
      case 'wall':
        geometry = new BoxGeometry(b.size.x, b.size.y, b.size.z);
        color = c.id.startsWith('backwall') ? 0x5b5e5a : 0x6c6d66;
        break;
      case 'barrier':
        geometry = makeBarrierGeometry(b.size.x, b.size.y, b.size.z);
        color = 0x8d8a83;
        break;
      case 'jamb':
        geometry = new BoxGeometry(b.size.x, b.size.y, b.size.z);
        color = 0x6f706a;
        translucent = b.center.z - b.size.z / 2 > LANE_HALF_WIDTH; // entirely in front of the lane: section cut
        break;
      case 'crate':
        geometry = new BoxGeometry(b.size.x, b.size.y, b.size.z);
        color = 0x4d5742;
        break;
      case 'locker':
        geometry = new BoxGeometry(b.size.x, b.size.y, b.size.z);
        color = 0x3b4044;
        break;
      case 'shelf':
        geometry = new BoxGeometry(b.size.x, b.size.y, b.size.z);
        color = 0x4b4842;
        break;
      case 'terminal':
        geometry = new BoxGeometry(b.size.x, b.size.y, b.size.z);
        color = 0x2b3037;
        break;
      case 'ceiling':
        return; // rendered as beams in decor (collider still active)
      default:
        geometry = new BoxGeometry(b.size.x, b.size.y, b.size.z);
        color = 0x55575a;
    }
    const material = new MeshStandardMaterial({ color, roughness: 0.92, metalness: 0.02 });
    if (translucent) {
      material.transparent = true;
      material.opacity = 0.42;
      material.depthWrite = false;
    }
    const mesh = new Mesh(geometry, material);
    mesh.castShadow = c.visualRole !== 'floor';
    mesh.receiveShadow = true;
    if (c.visualRole === 'barrier') mesh.position.set(b.center.x, b.center.y - b.size.y / 2, b.center.z);
    else mesh.position.set(b.center.x, b.center.y, b.center.z);
    mesh.userData.colliderId = c.id;
    this.staticGroup.add(mesh);
    const materials = [material];
    if (c.visualRole === 'crate' || c.visualRole === 'terminal' || translucent) {
      const edges = new LineSegments(new EdgesGeometry(geometry), new LineBasicMaterial({ color: translucent ? 0xb9c6cf : 0x262a22, transparent: true, opacity: translucent ? 0.8 : 0.6 }));
      edges.position.copy(mesh.position);
      this.staticGroup.add(edges);
    }
    if (c.visualRole === 'terminal') {
      const screenMat = new MeshStandardMaterial({ color: 0x1b3b66, emissive: 0x2f7bff, emissiveIntensity: 1.2, roughness: 0.4 });
      const screen = new Mesh(new BoxGeometry(b.size.x * 0.7, b.size.y * 0.45, 0.03), screenMat);
      screen.position.set(b.center.x, b.center.y + b.size.y * 0.12, b.center.z + b.size.z / 2 + 0.02);
      this.staticGroup.add(screen);
      this.terminalScreen = screenMat;
    }
    const base = new Color(color);
    const dim = base.clone().multiplyScalar(0.5).lerp(DIM_TARGET, 0.4);
    this.statics.push({ id: c.id, mesh, base, dim, lit: 1, materials });

    // Developer collider wireframe.
    const wire = new LineSegments(new EdgesGeometry(new BoxGeometry(b.size.x, b.size.y, b.size.z)), new LineBasicMaterial({ color: c.isCover ? 0xffd27f : 0x8fa1b3, transparent: true, opacity: 0.45 }));
    wire.position.set(b.center.x, b.center.y, b.center.z);
    this.colliderWire.add(wire);
  }

  private buildDecor(seed: SceneSeed): void {
    const mark = (o: Object3D) => {
      o.userData.decorative = true;
      this.decorGroup.add(o);
    };
    const span = seed.roomMaxX - seed.roomMinX;
    const mid = (seed.roomMinX + seed.roomMaxX) / 2;
    // Ceiling beams.
    for (const z of [-2.2, -0.6, 1.0]) {
      const beam = new Mesh(new BoxGeometry(span, 0.22, 0.22), new MeshStandardMaterial({ color: 0x2a2d30, roughness: 0.9 }));
      beam.position.set(mid, 4.86, z);
      beam.castShadow = true;
      mark(beam);
    }
    // Service pipe along the back wall.
    const pipe = new Mesh(new CylinderGeometry(0.07, 0.07, span, 8), new MeshStandardMaterial({ color: 0x3d4347, roughness: 0.6, metalness: 0.3 }));
    pipe.rotation.z = Math.PI / 2;
    pipe.position.set(mid, 4.35, -2.85);
    mark(pipe);
    // Practical lights: warm fixtures + point lights.
    for (const x of [-14.5, -7, -2.5, 5, 12.5, 18]) {
      const fixture = new Mesh(new BoxGeometry(0.7, 0.08, 0.22), new MeshStandardMaterial({ color: 0xffe3bd, emissive: 0xffc890, emissiveIntensity: 2.2 }));
      fixture.position.set(x, 4.6, -1.2);
      mark(fixture);
      const light = new PointLight(0xffc48a, 14, 10, 2);
      light.position.set(x, 4.3, -0.8);
      mark(light);
    }
    // Wall stripe (paint band) for readability.
    const stripe = new Mesh(new BoxGeometry(span, 0.12, 0.02), new MeshStandardMaterial({ color: 0x6d7266, roughness: 1 }));
    stripe.position.set(mid, 1.25, -2.99);
    mark(stripe);
    // Slot aperture outline on the near jamb face (explanatory marking).
    const slotShape = new Shape();
    slotShape.moveTo(-0.3, 0);
    slotShape.lineTo(0.3, 0);
    slotShape.lineTo(0.3, 2.2);
    slotShape.lineTo(-0.3, 2.2);
    slotShape.lineTo(-0.3, 0);
    const slotLine = new Line(new BufferGeometry().setFromPoints(slotShape.getPoints()), new LineBasicMaterial({ color: 0xcfd8df, transparent: true, opacity: 0.7 }));
    slotLine.position.set(10, 0.01, 1.62);
    mark(slotLine);
  }

  private buildZones(seed: SceneSeed): void {
    for (const z of seed.depthZones) {
      const b = z.bounds;
      const band = new Mesh(new BoxGeometry(b.size.x, 0.05, b.size.z), new MeshBasicMaterial({ color: CYAN, transparent: true, opacity: 0.35, depthWrite: false }));
      band.position.set(b.center.x, 0.03, b.center.z);
      band.userData.decorative = true;
      this.zoneGroup.add(band);
      const wire = new LineSegments(new EdgesGeometry(new BoxGeometry(b.size.x, b.size.y, b.size.z)), new LineBasicMaterial({ color: CYAN, transparent: true, opacity: 0.35 }));
      wire.position.set(b.center.x, b.center.y, b.center.z);
      wire.userData.dev = true;
      this.zoneGroup.add(wire);
      this.labels.upsert(`zone-${z.id}`, 'zone', `⇅ ${z.label}`, { x: b.center.x, y: 0.0, z: b.center.z + b.size.z / 2 }, 0, 14, 'W / S depth');
    }
    const cb = seed.captureBounds;
    const band = new Mesh(new BoxGeometry(cb.size.x, 0.05, cb.size.z), new MeshBasicMaterial({ color: AMBER, transparent: true, opacity: 0.3, depthWrite: false }));
    band.position.set(cb.center.x, 0.08, cb.center.z);
    this.zoneGroup.add(band);
    this.captureWire = new LineSegments(new EdgesGeometry(new BoxGeometry(cb.size.x, cb.size.y, cb.size.z)), new LineBasicMaterial({ color: AMBER, transparent: true, opacity: 0.4 }));
    this.captureWire.position.set(cb.center.x, cb.center.y, cb.center.z);
    this.captureWire.userData.dev = true;
    this.zoneGroup.add(this.captureWire);
  }

  private buildSmoke(bounds: Bounds): void {
    const box = new Mesh(new BoxGeometry(bounds.size.x, bounds.size.y, bounds.size.z), new MeshStandardMaterial({ color: 0xc9cbc6, transparent: true, opacity: 0.45, depthWrite: false, roughness: 1 }));
    box.position.set(bounds.center.x, bounds.center.y, bounds.center.z);
    this.smokeGroup.add(box);
    this.smokeMaterials.push(box.material as MeshStandardMaterial);
    const puffs = [
      [-1.3, 0.9, 0.4, 1.2],
      [0.6, 1.4, -0.8, 1.4],
      [1.5, 0.7, 0.9, 1.0],
      [-0.4, 2.2, 0.2, 1.1],
      [1.0, 2.4, -1.2, 0.9],
      [-1.6, 2.0, -0.9, 1.0],
    ];
    for (const [dx, dy, dz, r] of puffs) {
      const puff = new Mesh(new SphereGeometry(r!, 12, 10), new MeshStandardMaterial({ color: 0xd8dad5, transparent: true, opacity: 0.35, depthWrite: false, roughness: 1 }));
      puff.position.set(bounds.center.x + dx!, dy!, bounds.center.z + dz!);
      this.smokeGroup.add(puff);
      this.smokeMaterials.push(puff.material as MeshStandardMaterial);
    }
    this.smokeGroup.visible = false;
  }

  private buildCameraCone(seed: SceneSeed): void {
    const r = seed.recon;
    const len = r.range * 0.55;
    const radius = Math.tan((r.fovDegrees * Math.PI) / 360) * len;
    const geo = new ConeGeometry(radius, len, 4, 1, true);
    geo.rotateX(-Math.PI / 2); // axis along -Z ... then orient below
    geo.translate(0, 0, -len / 2);
    this.cameraCone.geometry.dispose();
    this.cameraCone.geometry = geo;
    this.cameraCone.position.set(r.position.x, r.position.y, r.position.z);
    this.cameraCone.lookAt(r.lookAt.x, r.lookAt.y, r.lookAt.z);
  }

  // ------------------------------------------------------------------ frame

  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.width = Math.max(1, Math.floor(rect.width));
    this.height = Math.max(1, Math.floor(rect.height));
    this.renderer.setSize(this.width, this.height, false);
    fitOrthographic(this.camera, this.width / this.height, VIEW_HEIGHT, this.followX, VIEW_CENTER_Y);
  }

  private halfWidth(): number {
    return (VIEW_HEIGHT / 2) * (this.width / this.height);
  }

  pixelsPerMeter(): number {
    return this.height / VIEW_HEIGHT;
  }

  /** Pointer (client px) → world X/Y on the z = 0 plane through the orthographic camera. */
  pointerToWorld(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const nx = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ny = -(((clientY - rect.top) / rect.height) * 2 - 1);
    return { x: this.camera.position.x + nx * this.camera.right, y: this.camera.position.y + ny * this.camera.top };
  }

  worldToScreen(x: number, y: number, z: number): { x: number; y: number } {
    const v = new Vector3(x, y, z).project(this.camera);
    return { x: (v.x * 0.5 + 0.5) * this.width, y: (-v.y * 0.5 + 0.5) * this.height };
  }

  frame(p: Presentation, dt: number, opts: FrameOptions): void {
    if (!this.seed) return;
    this.frameIndex += 1;
    this.wallClock += dt;
    const dev = opts.mode === 'developer';

    // Camera follow (translation only, clamped to the room).
    const target = followCenterX(p.player.position.x, this.seed.roomMinX, this.seed.roomMaxX, this.halfWidth());
    this.followX += (target - this.followX) * (1 - Math.exp(-dt / 0.25));
    fitOrthographic(this.camera, this.width / this.height, VIEW_HEIGHT, this.followX, VIEW_CENTER_Y);

    // Static readability.
    for (const s of this.statics) {
      const want = 0.32 + 0.68 * (p.staticLit.get(s.id) ?? 0);
      s.lit += (want - s.lit) * (1 - Math.exp(-dt / 0.3));
      for (const m of s.materials) m.color.copy(s.dim).lerp(s.base, s.lit);
    }

    // Player.
    const pl = p.player;
    this.player.group.position.set(pl.position.x, pl.position.y, pl.position.z);
    this.player.setTarget(pl.cover.anchors);
    this.player.update(dt, pl.facingX, pl.moving, pl.moveMode === 'SPRINT');
    this.player.setOutline(false);
    const keepLabels = new Set<string>();
    if (Math.abs(pl.position.z) > LANE_HALF_WIDTH) {
      this.labels.upsert('depth-player', 'depth', depthWord(pl.position.z), { x: pl.position.x, y: 0, z: pl.position.z }, 0, 16, `z ${pl.position.z.toFixed(1)} m`);
      keepLabels.add('depth-player');
    }

    // Dynamic entities.
    const present = new Set<string>();
    for (const e of p.entities) {
      present.add(e.id);
      let entry = this.actors.get(e.id);
      if (!entry) entry = this.createActor(e);
      entry.lastSeenFrame = this.frameIndex;
      entry.fadeStart = null;
      entry.object.visible = true;
      entry.object.position.set(e.position.x, e.position.y, e.position.z);
      if (entry.soldier) {
        entry.soldier.setTarget(e.stance === 'CROUCHED' ? { eyeY: 0.98, muzzleY: 0.92, height: 1.06, eyeForward: 0.14, muzzleForward: 0.58 } : { eyeY: 1.62, muzzleY: 1.38, height: 1.8, eyeForward: 0.12, muzzleForward: 0.62 });
        entry.soldier.update(dt, e.facingX, e.moving, false);
        entry.soldier.setGhost(dev && !e.observed);
        entry.soldier.setOutline(e.observed);
        entry.soldier.setFlash(e.hitFlash);
        entry.soldier.setOpacity(1);
      } else {
        entry.object.traverse((o) => {
          const m = (o as Mesh).material as MeshStandardMaterial | undefined;
          if (m && 'opacity' in m) {
            m.transparent = dev && !e.observed;
            m.opacity = dev && !e.observed ? 0.3 : 1;
            m.wireframe = dev && !e.observed;
          }
        });
      }
      if (entry.marker) entry.marker.visible = e.observed && e.kind === 'ENEMY';
      if (entry.marker) entry.marker.position.y = e.height + 0.28;
      if (Math.abs(e.position.z) > LANE_HALF_WIDTH && e.observed) {
        this.labels.upsert(`depth-${e.id}`, 'depth', depthWord(e.position.z), { x: e.position.x, y: 0, z: e.position.z }, 0, 16, `z ${e.position.z.toFixed(1)} m`);
        keepLabels.add(`depth-${e.id}`);
      }
      if (dev && e.observed) {
        const src = e.sources.map((s) => (s === 'player' ? 'DIRECT' : s.toUpperCase())).join(' + ');
        this.labels.upsert(`src-${e.id}`, 'source', src, { x: e.position.x, y: e.height + 0.5, z: e.position.z });
        keepLabels.add(`src-${e.id}`);
      }
    }
    // Entities that just dropped out: brief frozen fade at the last observed transform, then hidden.
    for (const [id, entry] of this.actors) {
      if (present.has(id)) continue;
      if (entry.fadeStart === null) {
        entry.fadeStart = this.wallClock;
        entry.frozenAt.copy(entry.object.position);
      }
      const age = this.wallClock - entry.fadeStart;
      if (age < 0.15) {
        entry.object.visible = true;
        entry.object.position.copy(entry.frozenAt);
        entry.soldier?.setOutline(false);
        entry.soldier?.setOpacity(1 - age / 0.15);
        if (entry.marker) entry.marker.visible = false;
      } else {
        entry.object.visible = false;
      }
    }
    this.labels.prune('depth-', keepLabels);
    this.labels.prune('src-', keepLabels);

    // Camera device + tag.
    const camVisible = p.camera.deviceObserved || dev;
    this.cameraDevice.visible = camVisible;
    if (this.cameraLed) {
      const led = this.cameraLed.material as MeshStandardMaterial;
      led.emissive.set(p.camera.status === 'ONLINE' ? 0x33ffcc : p.camera.status === 'JAMMED' ? 0xffaa33 : 0xff3344);
      led.color.copy(led.emissive);
    }
    if (camVisible) {
      this.labels.upsert('cam-tag', `camtag ${p.camera.status.toLowerCase()}`, `${p.camera.label} / ${p.camera.statusLabel}`, { x: p.camera.position.x, y: p.camera.position.y + 0.4, z: p.camera.position.z });
      keepLabels.add('cam-tag');
    } else this.labels.remove('cam-tag');

    // Terminal readout.
    if (this.terminalScreen) {
      const o = p.objective;
      const c = o.status === 'SECURED' ? 0x37d67a : o.status === 'CONTESTED' ? 0xff9a3c : o.status === 'CAPTURING' ? 0x5fd3ff : 0x2f7bff;
      this.terminalScreen.emissive.set(c);
      this.terminalScreen.emissiveIntensity = o.status === 'CAPTURING' ? 1.2 + 0.5 * Math.sin(this.wallClock * 6) : 1.1;
      const cb = this.seed.captureBounds;
      const pct = Math.round(o.progress * 100);
      const text = o.status === 'SECURED' ? 'CONTROL SECURED' : o.status === 'CONTESTED' ? 'CONTESTED' : o.status === 'CAPTURING' ? `CAPTURING ${pct}%` : o.status === 'PAUSED' ? `PAUSED ${pct}%` : 'CONTROL A';
      this.labels.upsert('terminal', `terminal ${o.status.toLowerCase()}`, text, { x: cb.center.x, y: 2.1, z: cb.center.z }, 0, 0, 'capture zone');
    }

    // Last-known markers (hollow, non-humanoid, aged).
    const keepLk = new Set<string>();
    for (const { record, age } of p.lastKnown) {
      const id = `lk-${record.entityId}`;
      keepLk.add(id);
      const h = this.labels.upsert(id, 'lastknown', `LAST SEEN ${Math.floor(age)}s`, { x: record.position.x, y: 0, z: record.position.z }, 0, -6, depthWord(record.position.z));
      const fade = Math.max(0.25, 1 - age / Math.max(1, p.config.lastKnownSeconds));
      h.el.style.opacity = fade.toFixed(2);
    }
    this.labels.prune('lk-', keepLk);

    // Smoke.
    this.smokeGroup.visible = p.smoke.enabled;
    if (p.smoke.enabled) {
      for (let i = 0; i < this.smokeMaterials.length; i++) {
        const m = this.smokeMaterials[i]!;
        m.opacity = (i === 0 ? 0.42 : 0.3) + 0.05 * Math.sin(this.wallClock * 0.8 + i);
      }
    }

    // Tracers.
    for (let i = 0; i < this.tracerPool.length; i++) {
      const line = this.tracerPool[i]!;
      const impact = this.impactPool[i]!;
      const t = p.tracers[p.tracers.length - 1 - i];
      if (!t) {
        line.visible = false;
        impact.visible = false;
        continue;
      }
      const end = dev ? t.tracer.trueEnd : t.tracer.publicEnd;
      line.geometry.setFromPoints([new Vector3(t.tracer.origin.x, t.tracer.origin.y, t.tracer.origin.z), new Vector3(end.x, end.y, end.z)]);
      const k = Math.max(0, 1 - t.age / 0.6);
      (line.material as LineBasicMaterial).opacity = k * (t.tracer.test ? 0.5 : 0.95);
      (line.material as LineBasicMaterial).color.set(t.tracer.test ? 0x9fd9ff : 0xffd18a);
      line.visible = true;
      const showImpact = t.tracer.hitKind === 'collider' || (t.tracer.hitKind === 'actor' && (t.tracer.hitObserved || dev));
      impact.visible = showImpact && t.age < 0.3;
      impact.position.set(end.x, end.y, end.z);
      (impact.material as MeshBasicMaterial).opacity = Math.max(0, 1 - t.age / 0.3);
    }

    // Developer overlays.
    this.overlayGroup.visible = dev;
    this.colliderWire.visible = dev && opts.showColliders;
    for (const child of this.zoneGroup.children) {
      if (child.userData.dev) child.visible = dev && opts.showZones;
      else child.visible = opts.showZones || !dev;
    }
    if (dev) this.updateDevOverlays(p, opts);

    this.renderer.render(this.scene, this.camera);
    this.labels.update(this.camera, this.width, this.height);
  }

  private createActor(e: EntityView): ActorEntry {
    let entry: ActorEntry;
    if (e.kind === 'ENEMY') {
      const soldier = new SoldierModel(ENEMY_TINT);
      soldier.snapPose({ eyeY: 1.62, muzzleY: 1.38, height: 1.8, eyeForward: 0.12, muzzleForward: 0.62 });
      const marker = new Mesh(new ConeGeometry(0.09, 0.16, 3), new MeshBasicMaterial({ color: 0xc4532f }));
      marker.rotation.x = Math.PI;
      marker.position.y = 2.05;
      soldier.group.add(marker);
      entry = { kind: e.kind, object: soldier.group, soldier, marker, lastSeenFrame: 0, fadeStart: null, frozenAt: new Vector3() };
    } else {
      entry = { kind: e.kind, object: makeBag(), soldier: null, marker: null, lastSeenFrame: 0, fadeStart: null, frozenAt: new Vector3() };
    }
    this.dynamicGroup.add(entry.object);
    this.actors.set(e.id, entry);
    return entry;
  }

  private updateDevOverlays(p: Presentation, opts: FrameOptions): void {
    const d = p.dev;
    if (!d) return;
    const eye = p.player.cover.eye;
    const muzzle = p.player.cover.muzzle;
    this.eyeMarker.position.set(eye.x, eye.y, eye.z);
    this.muzzleMarker.position.set(muzzle.x, muzzle.y, muzzle.z);

    // Sight sample rays (clipped at the first obstruction).
    const positions: number[] = [];
    const colors: number[] = [];
    const pushSeg = (ax: number, ay: number, az: number, bx: number, by: number, bz: number, c: Color) => {
      positions.push(ax, ay, az, bx, by, bz);
      colors.push(c.r, c.g, c.b, c.r, c.g, c.b);
    };
    const cClear = new Color(CYAN);
    const cBlocked = new Color(0x5a7d8f);
    const cSmoke = new Color(0xb9a6d6);
    const cCamClear = new Color(0x7fe7d8);
    const cCamBlocked = new Color(0x4d7f78);
    if (opts.showRays) {
      for (const obs of d.playerSight) {
        for (const s of obs.samples) {
          if (s.reason === 'fov' || s.reason === 'range') continue;
          const t = s.reason === 'clear' ? 1 : s.clipT;
          pushSeg(eye.x, eye.y, eye.z, eye.x + (s.point.x - eye.x) * t, eye.y + (s.point.y - eye.y) * t, eye.z + (s.point.z - eye.z) * t, s.reason === 'clear' ? cClear : s.reason === 'smoke' ? cSmoke : cBlocked);
        }
      }
      const cam = p.camera;
      for (const obs of d.cameraSight) {
        for (const s of obs.samples) {
          if (s.reason === 'fov' || s.reason === 'range') continue;
          const t = s.reason === 'clear' ? 1 : s.clipT;
          pushSeg(cam.position.x, cam.position.y, cam.position.z, cam.position.x + (s.point.x - cam.position.x) * t, cam.position.y + (s.point.y - cam.position.y) * t, cam.position.z + (s.point.z - cam.position.z) * t, s.reason === 'clear' ? cCamClear : s.reason === 'smoke' ? cSmoke : cCamBlocked);
        }
      }
    }
    this.sightLines.geometry.dispose();
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(positions, 3));
    g.setAttribute('color', new Float32BufferAttribute(colors, 3));
    this.sightLines.geometry = g;
    this.sightLines.visible = positions.length > 0;

    // Firing line preview.
    const fl = d.firingLine;
    if (fl && opts.showRays) {
      this.fireLine.geometry.setFromPoints([new Vector3(fl.origin.x, fl.origin.y, fl.origin.z), new Vector3(fl.end.x, fl.end.y, fl.end.z)]);
      this.fireLine.visible = true;
      this.fireHit.visible = fl.hit !== null;
      this.fireHit.position.set(fl.end.x, fl.end.y, fl.end.z);
      (this.fireHit.material as MeshBasicMaterial).color.set(fl.hit?.kind === 'actor' ? 0xff6a4a : AMBER);
    } else {
      this.fireLine.visible = false;
      this.fireHit.visible = false;
    }

    // Explanatory observation cone (not the authoritative algorithm).
    this.playerCone.visible = opts.showCones;
    if (opts.showCones) {
      const radius = Math.min(p.config.visionRange, 7.5);
      const half = (p.config.visionFovDegrees * Math.PI) / 360;
      const shape = new Shape();
      shape.moveTo(0, 0);
      const steps = 24;
      for (let i = 0; i <= steps; i++) {
        const a = -half + (2 * half * i) / steps;
        shape.lineTo(Math.cos(a) * radius * p.player.facingX, Math.sin(a) * radius);
      }
      shape.closePath();
      this.playerCone.geometry.dispose();
      this.playerCone.geometry = new ShapeGeometry(shape);
      this.playerCone.position.set(eye.x, eye.y, eye.z);
    }
    this.cameraCone.visible = opts.showCones && p.camera.status === 'ONLINE';
  }

  dispose(): void {
    this.labels.dispose();
    this.clearGroup(this.staticGroup);
    this.clearGroup(this.decorGroup);
    this.clearGroup(this.colliderWire);
    this.clearGroup(this.zoneGroup);
    this.clearGroup(this.smokeGroup);
    for (const entry of this.actors.values()) entry.soldier ? entry.soldier.dispose() : disposeObject(entry.object);
    this.actors.clear();
    this.player.dispose();
    disposeObject(this.cameraDevice);
    disposeObject(this.overlayGroup);
    for (const l of this.tracerPool) disposeObject(l);
    for (const m of this.impactPool) disposeObject(m);
    this.renderer.dispose();
  }
}

export const _aabbFromBounds = aabbFromBounds;
