import { Box3, Mesh } from 'three';
import { describe, expect, it } from 'vitest';
import { aabbFromBounds } from '../src/shared/geometry.ts';
import { SCENARIOS } from '../src/shared/scenarios.ts';
import { colliderTrim, zoneSignText } from '../src/scene/props.ts';

describe('v0.2.4 map dressing never changes gameplay geometry', () => {
  const scene = SCENARIOS[0]!.initialScene;

  it('decorative trim stays inside its collider and is flagged decorative', () => {
    for (const c of scene.colliders) {
      const b = aabbFromBounds(c.bounds);
      for (const trim of colliderTrim(c)) {
        expect(trim.userData.decorative).toBe(true);
        trim.updateMatrixWorld(true);
        const box = new Box3().setFromObject(trim as Mesh);
        const tol = 0.002;
        expect(box.min.x).toBeGreaterThanOrEqual(b.min.x - tol);
        expect(box.max.x).toBeLessThanOrEqual(b.max.x + tol);
        expect(box.min.y).toBeGreaterThanOrEqual(b.min.y - tol);
        expect(box.max.y).toBeLessThanOrEqual(b.max.y + tol);
        expect(box.min.z).toBeGreaterThanOrEqual(b.min.z - tol);
        expect(box.max.z).toBeLessThanOrEqual(b.max.z + tol);
      }
    }
  });

  it('every depth zone has an in-world facility sign', () => {
    for (const z of scene.depthZones) {
      const t = zoneSignText(z);
      expect(t.title.length).toBeGreaterThan(3);
      expect(t.subtitle).toMatch(/RECESS|STAND BACK/);
    }
  });
});
