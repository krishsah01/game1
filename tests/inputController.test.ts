import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { InputController } from '../src/app/inputController.ts';

/**
 * Real mice send pointerdown only for the FIRST button and pointerup only for
 * the LAST; a left click while the right button is held (aiming) arrives as a
 * pointermove whose `buttons` gained the left bit. Minimal DOM stubs replay
 * exactly that sequence in Node.
 */
class FakeCanvas extends EventTarget {
  tagName = 'CANVAS';
  focus(): void {
    (globalThis as any).document.activeElement = this;
  }
}

function pointer(type: string, button: number, buttons: number): Event {
  return Object.assign(new Event(type), { button, buttons, clientX: 10, clientY: 10, preventDefault() {} });
}

describe('mouse buttons: aim with right, fire with left while aiming', () => {
  let canvas: FakeCanvas;
  let fired: number;
  let input: InputController;

  beforeEach(() => {
    (globalThis as any).window = new EventTarget();
    (globalThis as any).document = Object.assign(new EventTarget(), { activeElement: null, hidden: false });
    canvas = new FakeCanvas();
    fired = 0;
    input = new InputController(canvas as unknown as HTMLCanvasElement, () => null, () => ({ x: 0, y: 0 }), {
      onFocusLost: () => {},
      onToggleDeveloper: () => {},
      onEscape: () => {},
      onFire: () => (fired += 1),
      onToggleCameraLink: () => {},
    });
    input.attach();
  });

  afterEach(() => {
    input.detach();
    delete (globalThis as any).window;
    delete (globalThis as any).document;
  });

  it('a left press while the right button is held fires (chorded pointermove), once', () => {
    canvas.dispatchEvent(pointer('pointerdown', 2, 2));
    expect(input.held.aim).toBe(true);
    canvas.dispatchEvent(pointer('pointermove', 0, 3)); // left pressed during the hold
    expect(fired).toBe(1);
    canvas.dispatchEvent(pointer('pointermove', -1, 3)); // plain movement with both held
    expect(fired).toBe(1);
    canvas.dispatchEvent(pointer('pointermove', 0, 2)); // left released, still aiming
    expect(input.held.aim).toBe(true);
    canvas.dispatchEvent(pointer('pointermove', 0, 3)); // second shot
    expect(fired).toBe(2);
    canvas.dispatchEvent(pointer('pointermove', 2, 1)); // right released first
    expect(input.held.aim).toBe(false);
    canvas.dispatchEvent(pointer('pointerup', 0, 0));
    expect(fired).toBe(2);
  });

  it('a plain left click fires; a right press alone only aims', () => {
    canvas.dispatchEvent(pointer('pointerdown', 0, 1));
    canvas.dispatchEvent(pointer('pointerup', 0, 0));
    expect(fired).toBe(1);
    canvas.dispatchEvent(pointer('pointerdown', 2, 2));
    expect(fired).toBe(1);
    expect(input.held.aim).toBe(true);
    canvas.dispatchEvent(pointer('pointerup', 2, 0));
    expect(input.held.aim).toBe(false);
  });

  it('leaving the canvas drops the held buttons', () => {
    canvas.dispatchEvent(pointer('pointerdown', 2, 2));
    canvas.dispatchEvent(new Event('pointerleave'));
    expect(input.held.aim).toBe(false);
    // Re-entering with both buttons already held resumes aiming but is not a shot.
    canvas.dispatchEvent(pointer('pointermove', -1, 3));
    expect(input.held.aim).toBe(true);
    expect(fired).toBe(0);
  });
});
