/**
 * Owns the WebGL canvas, the SceneView, the input controller and the render
 * loop. React never drives per-frame transforms; the loop writes HUD-critical
 * elements (reticle, sound arcs) through refs.
 */
import { useEffect, useRef } from 'react';
import { SceneView } from '../scene/sceneView.ts';
import type { ViewMode } from '../simulation/world.ts';
import { InputController } from './inputController.ts';
import type { SessionController } from './sessionController.ts';

export interface DevOptions {
  showRays: boolean;
  showColliders: boolean;
  showCones: boolean;
  showZones: boolean;
}

interface Props {
  controller: SessionController;
  mode: ViewMode;
  devOptions: DevOptions;
  onToggleDeveloper: () => void;
  onEscape: () => void;
  onFocusLost: () => void;
  paused: boolean;
}

export function SceneCanvas({ controller, mode, devOptions, onToggleDeveloper, onEscape, onFocusLost, paused }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const labelRef = useRef<HTMLDivElement>(null);
  const reticleRef = useRef<HTMLDivElement>(null);
  const dotRef = useRef<HTMLDivElement>(null);
  const reticleLabelRef = useRef<HTMLDivElement>(null);
  const pulseLeftRef = useRef<HTMLDivElement>(null);
  const pulseRightRef = useRef<HTMLDivElement>(null);
  const modeRef = useRef(mode);
  const devRef = useRef(devOptions);
  const callbacksRef = useRef({ onToggleDeveloper, onEscape, onFocusLost });
  modeRef.current = mode;
  devRef.current = devOptions;
  callbacksRef.current = { onToggleDeveloper, onEscape, onFocusLost };

  useEffect(() => {
    const canvas = canvasRef.current;
    const labelRoot = labelRef.current;
    if (!canvas || !labelRoot) return;
    const view = new SceneView(canvas, labelRoot);
    const input = new InputController(
      canvas,
      () => controller.world,
      (x, y) => view.pointerToWorld(x, y),
      {
        onFocusLost: () => callbacksRef.current.onFocusLost(),
        onToggleDeveloper: () => callbacksRef.current.onToggleDeveloper(),
        onEscape: () => callbacksRef.current.onEscape(),
        onFire: () => controller.world?.command({ type: 'fire' }),
      },
    );
    input.attach();
    // Small debug hook for scripted walkthroughs (world → screen projection).
    (window as unknown as { __milsimLab?: unknown }).__milsimLab = { worldToScreen: (x: number, y: number, z: number) => view.worldToScreen(x, y, z) };
    if (controller.world) view.setScene(controller.world.scene);
    const prevReplaced = controller.onWorldReplaced;
    controller.onWorldReplaced = (world) => {
      view.setScene(world.scene);
      input.clear(false);
      prevReplaced?.(world);
    };

    const ro = new ResizeObserver(() => view.resize());
    ro.observe(canvas);

    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
      last = now;
      const world = controller.world;
      if (!world) return;
      input.sync();
      world.advance(dt);
      const p = world.snapshot(modeRef.current);
      view.frame(p, dt, { mode: modeRef.current, ...devRef.current });

      // Reticle follows the pointer; the dot encodes the current depth offset (world Z → pixels).
      const reticle = reticleRef.current;
      if (reticle) {
        if (input.pointerInside) {
          const rect = canvas.getBoundingClientRect();
          const rx = input.pointerClient.x - rect.left;
          const ry = input.pointerClient.y - rect.top;
          reticle.style.transform = `translate(${rx.toFixed(1)}px, ${ry.toFixed(1)}px)`;
          reticle.style.opacity = '1';
          const px = Math.max(-26, Math.min(26, p.aim.depthOffset * view.pixelsPerMeter()));
          if (dotRef.current) dotRef.current.style.transform = `translate(${px.toFixed(1)}px, 0)`;
          if (reticleLabelRef.current) {
            const z = p.aim.selectedDepth;
            reticleLabelRef.current.textContent = `${p.aim.depthWord} · z ${z >= 0 ? '+' : ''}${z.toFixed(2)} · ${p.aim.situation.toLowerCase()}`;
          }
        } else reticle.style.opacity = '0';
      }

      // Sound arcs: broad, directional, rate-limited; no position encoded.
      const left = pulseLeftRef.current;
      const right = pulseRightRef.current;
      if (left && right) {
        let l = 0;
        let r = 0;
        for (const { pulse, age } of p.pulses) {
          const k = Math.max(0, 1 - age / 1.1) * pulse.loudness;
          if (pulse.direction < 0) l = Math.max(l, k);
          else r = Math.max(r, k);
        }
        left.style.opacity = l.toFixed(2);
        right.style.opacity = r.toFixed(2);
      }
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      input.detach();
      controller.onWorldReplaced = prevReplaced;
      view.dispose();
    };
  }, [controller]);

  return (
    <div className="stage">
      <canvas ref={canvasRef} className="scene-canvas" tabIndex={0} aria-label="Interactive 3D concept scene" />
      <div ref={labelRef} className="label-layer" aria-hidden="true" />
      <div ref={pulseLeftRef} className="pulse left" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <div ref={pulseRightRef} className="pulse right" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <div ref={reticleRef} className="reticle" aria-hidden="true">
        <div className="ring" />
        <div className="cross" />
        <div className="guide" />
        <div ref={dotRef} className="dot" />
        <div ref={reticleLabelRef} className="reticle-label" />
      </div>
      {mode === 'developer' && <div className="dev-badge">DEVELOPER VIEW — OMNISCIENT</div>}
      {paused && (
        <div className="paused-badge" role="status">
          PAUSED
        </div>
      )}
    </div>
  );
}
