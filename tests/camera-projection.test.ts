import { OrthographicCamera, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { fitOrthographic } from '../src/scene/cameraRig.ts';

describe('fixed perpendicular orthographic camera', () => {
  it('two equal-size actors at different depths project to the same screen height', () => {
    const cam = new OrthographicCamera(-10, 10, 5, -5, 0.1, 100);
    fitOrthographic(cam, 16 / 9, 8.5, 0, 3.2);
    const project = (p: Vector3) => p.clone().project(cam);
    const nearFeet = project(new Vector3(2, 0, 0.8));
    const nearHead = project(new Vector3(2, 1.8, 0.8));
    const farFeet = project(new Vector3(-3, 0, -2.4));
    const farHead = project(new Vector3(-3, 1.8, -2.4));
    expect(nearHead.y - nearFeet.y).toBeCloseTo(farHead.y - farFeet.y, 9);
    // Depth changes nothing but the depth buffer value.
    expect(nearFeet.x).toBeCloseTo(project(new Vector3(2, 0, -2.4)).x, 9);
  });

  it('camera looks straight down -Z with world Y up and never tilts', () => {
    const cam = new OrthographicCamera(-10, 10, 5, -5, 0.1, 100);
    fitOrthographic(cam, 1.5, 8.5, 4, 3.2);
    const dir = new Vector3();
    cam.getWorldDirection(dir);
    expect(dir.x).toBeCloseTo(0, 9);
    expect(dir.y).toBeCloseTo(0, 9);
    expect(dir.z).toBeCloseTo(-1, 9);
    expect(cam.position.x).toBeCloseTo(4);
    expect(cam.position.y).toBeCloseTo(3.2);
    expect(cam.up.y).toBe(1);
  });

  it('resize preserves the view height and scales width by aspect', () => {
    const cam = new OrthographicCamera(-10, 10, 5, -5, 0.1, 100);
    fitOrthographic(cam, 2, 8.5, 0, 3.2);
    expect(cam.top - cam.bottom).toBeCloseTo(8.5);
    expect(cam.right - cam.left).toBeCloseTo(17);
    fitOrthographic(cam, 1, 8.5, 0, 3.2);
    expect(cam.top - cam.bottom).toBeCloseTo(8.5);
    expect(cam.right - cam.left).toBeCloseTo(8.5);
  });
});
