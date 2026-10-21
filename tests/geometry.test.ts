import { describe, expect, it } from 'vitest';
import { aabbFromBounds, angleBetweenDeg, rayAabb, segmentAabb } from '../src/shared/geometry.ts';
import { bounds } from '../src/shared/types.ts';

describe('geometry', () => {
  const box = aabbFromBounds(bounds(5, 0.5, 0, 2, 1, 2)); // x 4..6, y 0..1, z -1..1

  it('ray hits a box in front of it and reports entry distance', () => {
    const r = rayAabb({ x: 0, y: 0.5, z: 0 }, { x: 1, y: 0, z: 0 }, box, 100);
    expect(r).not.toBeNull();
    expect(r!.tEntry).toBeCloseTo(4);
    expect(r!.tExit).toBeCloseTo(6);
  });

  it('ray misses a box above its height', () => {
    expect(rayAabb({ x: 0, y: 2, z: 0 }, { x: 1, y: 0, z: 0 }, box, 100)).toBeNull();
  });

  it('ray misses a box beside it in depth', () => {
    expect(rayAabb({ x: 0, y: 0.5, z: 1.5 }, { x: 1, y: 0, z: 0 }, box, 100)).toBeNull();
  });

  it('segment reports fraction of first contact and null when short', () => {
    expect(segmentAabb({ x: 0, y: 0.5, z: 0 }, { x: 8, y: 0.5, z: 0 }, box)).toBeCloseTo(0.5);
    expect(segmentAabb({ x: 0, y: 0.5, z: 0 }, { x: 3, y: 0.5, z: 0 }, box)).toBeNull();
  });

  it('a rising ray enters a low box through its near face even though it would clear the far edge', () => {
    // Eye at y 0.95, 0.55 m before a box with top at 1.1; target head beyond at 1.62.
    const barrier = aabbFromBounds(bounds(-10, 0.55, 0, 1.6, 1.1, 0.6));
    const t = segmentAabb({ x: -11.35, y: 0.95, z: 0 }, { x: -6.2, y: 1.62, z: 0 }, barrier);
    expect(t).not.toBeNull();
  });

  it('angle between vectors', () => {
    expect(angleBetweenDeg({ x: 1, y: 0, z: 0 }, { x: 1, y: 1, z: 0 })).toBeCloseTo(45);
    expect(angleBetweenDeg({ x: 1, y: 0, z: 0 }, { x: -1, y: 0, z: 0 })).toBeCloseTo(180);
  });
});
