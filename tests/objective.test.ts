import { describe, expect, it } from 'vitest';
import { makeWorld, observed, seconds, ticks } from './helpers.ts';

describe('CONTROL A capture illustration', () => {
  it('advances only with attacker occupancy and no defender, pauses on contest and on leaving, then secures', () => {
    const w = makeWorld('control-point', { captureSeconds: 4 });
    ticks(w, 5);
    expect(w.objective.status).toBe('IDLE');
    w.command({ type: 'teleportPlayer', x: 15.6, z: 0, facingX: 1 });
    seconds(w, 1);
    expect(w.objective.status).toBe('CAPTURING');
    const p1 = w.objective.progress;
    expect(p1).toBeGreaterThan(0.2);

    w.command({ type: 'setContestTarget', index: 1 });
    seconds(w, 2.5);
    expect(w.objective.status).toBe('CONTESTED');
    const held = w.objective.progress;
    seconds(w, 1);
    expect(w.objective.progress).toBeCloseTo(held, 6);
    // The defender inside the zone is behind the crate stack: no marker, no entity in player view.
    expect(observed(w, 'enemy-d')).toBe(false);
    expect(w.snapshot('player').entities).toHaveLength(0);

    w.command({ type: 'setContestTarget', index: 0 });
    seconds(w, 2.5);
    expect(w.objective.status).toBe('CAPTURING');

    w.command({ type: 'teleportPlayer', x: 13.0, z: 0, facingX: 1 });
    ticks(w, 2);
    expect(w.objective.status).toBe('PAUSED');
    const paused = w.objective.progress;
    seconds(w, 1);
    expect(w.objective.progress).toBeCloseTo(paused, 6);

    w.command({ type: 'teleportPlayer', x: 15.6, z: 0, facingX: 1 });
    seconds(w, 5);
    expect(w.objective.status).toBe('SECURED');
    expect(w.objective.progress).toBe(1);

    w.reset();
    expect(w.objective.status).toBe('IDLE');
    expect(w.objective.progress).toBe(0);
    expect(w.actors.find((a) => a.id === 'enemy-d')!.position.x).toBeCloseTo(20.0);
  });
});
