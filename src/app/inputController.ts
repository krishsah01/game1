/**
 * Keyboard/mouse input for the canvas. Inputs are honoured only while the
 * canvas owns input (it is focused, or the pointer is over it and no form
 * control is focused). Focus loss clears every held input.
 *
 * Keys (prototype v0.2):
 *   A / D, ← →   move          W / ↑  go FAR (far edge of the depth zone)
 *   S / ↓        back to lane  Space  vault the obstacle ahead
 *   C crouch · Z prone · F (hold) observe · RMB (hold) aim · LMB fire
 *   Tab cycles walk → combat → sprint · Q / E aim depth · B brace
 *   V developer view · P pause · . step · R reload · Esc help
 */
import { emptyHeld, type HeldInput } from '../simulation/input.ts';
import type { World } from '../simulation/world.ts';

export interface InputCallbacks {
  onFocusLost: () => void;
  onToggleDeveloper: () => void;
  onEscape: () => void;
  onFire: () => void;
}

const FORM_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON']);
const HANDLED = new Set(['a', 'd', 'w', 's', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' ', 'Tab', 'c', 'z', 'f', 'q', 'e', 'b', 'v', 'r', 'Escape', 'p', '.']);

export class InputController {
  readonly held: HeldInput = emptyHeld();
  pointerInside = false;
  pointerClient = { x: 0, y: 0 };
  private keys = new Set<string>();
  private detachFns: (() => void)[] = [];

  constructor(
    private canvas: HTMLCanvasElement,
    private getWorld: () => World | null,
    private pointerToWorld: (clientX: number, clientY: number) => { x: number; y: number },
    private callbacks: InputCallbacks,
  ) {}

  canvasOwnsInput(): boolean {
    const active = document.activeElement;
    if (active === this.canvas) return true;
    if (active && FORM_TAGS.has(active.tagName)) return false;
    if (active && (active as HTMLElement).isContentEditable) return false;
    return this.pointerInside;
  }

  attach(): void {
    const on = <K extends keyof WindowEventMap>(target: Window, type: K, fn: (ev: WindowEventMap[K]) => void) => {
      target.addEventListener(type, fn);
      this.detachFns.push(() => target.removeEventListener(type, fn));
    };
    const onCanvas = <K extends keyof HTMLElementEventMap>(type: K, fn: (ev: HTMLElementEventMap[K]) => void) => {
      this.canvas.addEventListener(type, fn);
      this.detachFns.push(() => this.canvas.removeEventListener(type, fn));
    };

    on(window, 'keydown', (ev) => this.onKey(ev, true));
    on(window, 'keyup', (ev) => this.onKey(ev, false));
    on(window, 'blur', () => this.clear(true));
    const onVisibility = () => {
      if (document.hidden) this.clear(true);
    };
    document.addEventListener('visibilitychange', onVisibility);
    this.detachFns.push(() => document.removeEventListener('visibilitychange', onVisibility));

    onCanvas('pointermove', (ev) => {
      this.pointerInside = true;
      this.pointerClient = { x: ev.clientX, y: ev.clientY };
    });
    onCanvas('pointerenter', (ev) => {
      this.pointerInside = true;
      this.pointerClient = { x: ev.clientX, y: ev.clientY };
    });
    onCanvas('pointerleave', () => {
      this.pointerInside = false;
      this.held.aim = false;
      if (document.activeElement !== this.canvas) {
        // Hover-only ownership ends here: drop keys held via hover.
        this.keys.clear();
        this.recomputeAxes();
        this.held.observe = false;
      }
    });
    onCanvas('pointerdown', (ev) => {
      this.canvas.focus({ preventScroll: true });
      this.pointerClient = { x: ev.clientX, y: ev.clientY };
      if (ev.button === 2) {
        this.held.aim = true;
        ev.preventDefault();
      } else if (ev.button === 0) {
        this.callbacks.onFire();
      }
    });
    onCanvas('pointerup', (ev) => {
      if (ev.button === 2) this.held.aim = false;
    });
    onCanvas('contextmenu', (ev) => ev.preventDefault());
    onCanvas('blur', () => {
      // Keyboard-held states should not stick when focus moves to a control.
      this.keys.clear();
      this.recomputeAxes();
      this.held.observe = false;
    });
  }

  private onKey(ev: KeyboardEvent, down: boolean): void {
    const key = ev.key.length === 1 ? ev.key.toLowerCase() : ev.key;
    const world = this.getWorld();
    if (!HANDLED.has(key)) return;
    const owns = this.canvasOwnsInput();
    // Key presses are honoured only while the canvas owns input; releases are always
    // processed so a key pressed over the canvas can never stick after focus moves.
    if (down && !owns) return;
    if (owns) ev.preventDefault();
    if (ev.repeat) return;
    if (down) this.keys.add(key);
    else this.keys.delete(key);
    this.recomputeAxes();
    this.held.observe = this.keys.has('f');
    if (!down || !world) return;
    switch (key) {
      case 'w':
      case 'ArrowUp':
        world.command({ type: 'setDepthLane', lane: 'FAR' });
        break;
      case 's':
      case 'ArrowDown':
        world.command({ type: 'setDepthLane', lane: 'LANE' });
        break;
      case ' ':
        world.command({ type: 'vault' });
        break;
      case 'Tab':
        world.command({ type: 'cycleMoveMode' });
        break;
      case 'c':
        world.command({ type: 'toggleCrouch' });
        break;
      case 'z':
        world.command({ type: 'toggleProne' });
        break;
      case 'q':
        world.command({ type: 'stepDepth', direction: -1 });
        break;
      case 'e':
        world.command({ type: 'stepDepth', direction: 1 });
        break;
      case 'b':
        world.command({ type: 'toggleBrace' });
        break;
      case 'r':
        world.command({ type: 'reload' });
        break;
      case 'p':
        world.command({ type: 'togglePause' });
        break;
      case '.':
        world.command({ type: 'stepOnce' });
        break;
      case 'v':
        this.callbacks.onToggleDeveloper();
        break;
      case 'Escape':
        this.callbacks.onEscape();
        break;
    }
  }

  private recomputeAxes(): void {
    const left = this.keys.has('a') || this.keys.has('ArrowLeft');
    const right = this.keys.has('d') || this.keys.has('ArrowRight');
    this.held.moveX = left === right ? 0 : left ? -1 : 1;
  }

  /** Clears all held inputs (focus loss / pause). */
  clear(notify: boolean): void {
    this.keys.clear();
    this.held.moveX = 0;
    this.held.observe = false;
    this.held.aim = false;
    if (notify) this.callbacks.onFocusLost();
  }

  /** Called once per frame: publishes pointer + held state to the world. */
  sync(): void {
    this.held.pointerWorld = this.pointerInside ? this.pointerToWorld(this.pointerClient.x, this.pointerClient.y) : null;
    this.getWorld()?.setHeld(this.held);
  }

  detach(): void {
    for (const fn of this.detachFns) fn();
    this.detachFns = [];
  }
}
