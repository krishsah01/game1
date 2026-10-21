/**
 * DEVELOPER VIEW — OMNISCIENT top-view inset. A separate 2D drawing of true
 * geometry on the X/Z plane (not the gameplay camera, not a minimap).
 * Up on this canvas is into the screen (-Z).
 */
import { useEffect, useRef } from 'react';
import { aabbFromBounds } from '../shared/geometry.ts';
import type { SessionController } from './sessionController.ts';

const Z_MIN = -3.4;
const Z_MAX = 1.8;

export function TopView({ controller }: { controller: SessionController }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const world = controller.world;
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#121518';
      ctx.fillRect(0, 0, w, h);
      if (!world) return;
      const p = world.snapshot('developer');
      const scene = p.scene;
      // Window: 20 m wide around the player.
      const halfSpan = 10;
      const cx = Math.min(scene.roomMaxX - halfSpan, Math.max(scene.roomMinX + halfSpan, p.player.position.x));
      const xMin = cx - halfSpan;
      const sx = w / (halfSpan * 2);
      const sz = h / (Z_MAX - Z_MIN);
      const X = (x: number) => (x - xMin) * sx;
      const Z = (z: number) => (Z_MAX - z) * sz; // -Z (far) is up
      const rect = (bx: number, bz: number, bw: number, bd: number, fill: string, stroke?: string) => {
        ctx.fillStyle = fill;
        ctx.fillRect(X(bx), Z(bz + bd), bw * sx, bd * sz);
        if (stroke) {
          ctx.strokeStyle = stroke;
          ctx.lineWidth = 1;
          ctx.strokeRect(X(bx), Z(bz + bd), bw * sx, bd * sz);
        }
      };
      // Lane.
      rect(xMin, -0.3, halfSpan * 2, 0.6, 'rgba(95,211,255,0.05)');
      // Colliders.
      for (const c of scene.colliders) {
        if (c.visualRole === 'floor' || c.visualRole === 'ceiling') continue;
        const b = aabbFromBounds(c.bounds);
        const fill = c.visualRole === 'wall' || c.visualRole === 'jamb' ? '#55595c' : c.isCover ? '#7a7366' : c.visualRole === 'terminal' ? '#2f4f7a' : '#3f4a38';
        rect(b.min.x, b.min.z, b.max.x - b.min.x, b.max.z - b.min.z, fill, 'rgba(255,255,255,0.12)');
      }
      // Zones + capture + smoke.
      for (const z of scene.depthZones) {
        const b = aabbFromBounds(z.bounds);
        rect(b.min.x, b.min.z, b.max.x - b.min.x, b.max.z - b.min.z, 'rgba(95,211,255,0.08)', 'rgba(95,211,255,0.5)');
      }
      {
        const b = aabbFromBounds(scene.captureBounds);
        rect(b.min.x, b.min.z, b.max.x - b.min.x, b.max.z - b.min.z, 'rgba(255,180,84,0.08)', 'rgba(255,180,84,0.6)');
      }
      if (p.smoke.enabled) {
        const b = aabbFromBounds(scene.smokeBounds);
        rect(b.min.x, b.min.z, b.max.x - b.min.x, b.max.z - b.min.z, 'rgba(220,220,215,0.25)');
      }
      // Cameras (both teams in developer view) + cones.
      for (const cam of p.cameras) {
        const friendly = cam.team === 'FRIENDLY';
        ctx.strokeStyle = cam.status === 'ONLINE' ? (friendly ? 'rgba(127,231,216,0.9)' : 'rgba(255,106,90,0.9)') : 'rgba(255,90,90,0.45)';
        ctx.beginPath();
        ctx.arc(X(cam.position.x), Z(cam.position.z), 4, 0, Math.PI * 2);
        ctx.stroke();
        if (cam.status === 'ONLINE') {
          // Cameras sit on z = 0 and look in the X/Y plane, so the top view shows the cone's depth spread.
          const yaw = Math.atan2(cam.facing.z, cam.facing.x);
          const half = (cam.fovDegrees * Math.PI) / 360;
          const r = cam.range * 0.6;
          ctx.beginPath();
          ctx.moveTo(X(cam.position.x), Z(cam.position.z));
          ctx.lineTo(X(cam.position.x + Math.cos(yaw - half) * r), Z(cam.position.z + Math.sin(yaw - half) * r));
          ctx.lineTo(X(cam.position.x + Math.cos(yaw + half) * r), Z(cam.position.z + Math.sin(yaw + half) * r));
          ctx.closePath();
          ctx.fillStyle = friendly ? 'rgba(127,231,216,0.08)' : 'rgba(255,106,90,0.08)';
          ctx.fill();
        }
      }
      // Sight rays (player) and firing line.
      const eye = p.player.cover.eye;
      if (p.dev) {
        for (const o of p.dev.playerSight) {
          for (const s of o.samples) {
            if (s.reason === 'fov' || s.reason === 'range') continue;
            const t = s.reason === 'clear' ? 1 : s.clipT;
            ctx.strokeStyle = s.reason === 'clear' ? 'rgba(95,211,255,0.8)' : 'rgba(95,140,160,0.5)';
            ctx.beginPath();
            ctx.moveTo(X(eye.x), Z(eye.z));
            ctx.lineTo(X(eye.x + (s.point.x - eye.x) * t), Z(eye.z + (s.point.z - eye.z) * t));
            ctx.stroke();
          }
        }
        const fl = p.dev.firingLine;
        if (fl) {
          ctx.strokeStyle = 'rgba(255,180,84,0.9)';
          ctx.setLineDash([4, 3]);
          ctx.beginPath();
          ctx.moveTo(X(fl.origin.x), Z(fl.origin.z));
          ctx.lineTo(X(fl.end.x), Z(fl.end.z));
          ctx.stroke();
          ctx.setLineDash([]);
          if (fl.hit) {
            ctx.fillStyle = fl.hit.kind === 'actor' ? '#ff6a4a' : '#ffb454';
            ctx.beginPath();
            ctx.arc(X(fl.end.x), Z(fl.end.z), 3, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        // Selected depth line near the player.
        ctx.strokeStyle = 'rgba(95,211,255,0.6)';
        ctx.setLineDash([2, 3]);
        ctx.beginPath();
        ctx.moveTo(X(p.player.position.x - 1.5), Z(p.aim.selectedDepth));
        ctx.lineTo(X(p.player.position.x + 1.5), Z(p.aim.selectedDepth));
        ctx.stroke();
        ctx.setLineDash([]);
      }
      // Actors (truth).
      for (const e of p.entities) {
        ctx.fillStyle = e.kind === 'DROPPED_GEAR' ? (e.observed ? '#9ad4e8' : '#8a4f84') : e.observed ? '#5fd3ff' : '#ff5fa8';
        ctx.beginPath();
        ctx.arc(X(e.position.x), Z(e.position.z), e.kind === 'DROPPED_GEAR' ? 3 : 4, 0, Math.PI * 2);
        ctx.fill();
      }
      // Player.
      ctx.fillStyle = '#d8e6c6';
      ctx.beginPath();
      ctx.arc(X(p.player.position.x), Z(p.player.position.z), 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#d8e6c6';
      ctx.beginPath();
      ctx.moveTo(X(p.player.position.x), Z(p.player.position.z));
      ctx.lineTo(X(p.player.position.x + p.player.facingX * 0.6), Z(p.player.position.z));
      ctx.stroke();
      // Axes text.
      ctx.fillStyle = 'rgba(214,219,210,0.7)';
      ctx.font = '10px ui-monospace, monospace';
      ctx.fillText('X / travel →', 6, h - 6);
      ctx.save();
      ctx.translate(10, 70);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText('Z / depth (into screen ↑)', 0, 0);
      ctx.restore();
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [controller]);
  return (
    <div className="topview">
      <div className="topview-title">DEVELOPER VIEW — OMNISCIENT · top view (X/Z), not the gameplay camera</div>
      <canvas ref={ref} width={640} height={190} />
    </div>
  );
}
