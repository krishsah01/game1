import { useEffect, useState, useSyncExternalStore } from 'react';
import type { ApiClient, OperationRecord } from '../graphql/client.ts';
import type { Presentation, ViewMode } from '../simulation/world.ts';
import type { ControllerState, SessionController } from './sessionController.ts';

export function useControllerState(controller: SessionController): ControllerState {
  return useSyncExternalStore(
    (cb) => controller.subscribe(cb),
    () => controller.getState(),
    () => controller.getState(),
  );
}

export function useApiRecords(client: ApiClient): OperationRecord[] {
  return useSyncExternalStore(
    (cb) => client.subscribe(cb),
    () => client.getRecords(),
    () => client.getRecords(),
  );
}

/** Samples the simulation at a modest rate for React panels (the canvas renders at full rate). */
export function useHudSnapshot(controller: SessionController, mode: ViewMode, intervalMs = 90): Presentation | null {
  const [snap, setSnap] = useState<Presentation | null>(null);
  const state = useControllerState(controller);
  useEffect(() => {
    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      const w = controller.world;
      setSnap(w ? w.snapshot(mode) : null);
    };
    tick();
    const id = window.setInterval(tick, intervalMs);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [controller, mode, intervalMs, state.epoch, state.phase]);
  return snap;
}

/** Debounced commit helper for sliders: local value updates immediately, commit fires after `delay` ms of quiet. */
export function useDebouncedCommit<T>(value: T, commit: (v: T) => void, delay = 350): [T, (v: T) => void] {
  const [local, setLocal] = useState<T>(value);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (!dirty) setLocal(value);
  }, [value, dirty]);
  useEffect(() => {
    if (!dirty) return;
    const id = window.setTimeout(() => {
      commit(local);
      setDirty(false);
    }, delay);
    return () => window.clearTimeout(id);
  }, [local, dirty, delay, commit]);
  return [
    local,
    (v: T) => {
      setLocal(v);
      setDirty(true);
    },
  ];
}
