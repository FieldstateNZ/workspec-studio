import { createContext, useContext, type ReactNode } from 'react';
import { useStore } from 'zustand';
import type { CanvasHoverState } from './store/hover.js';
import type { CanvasStore, CanvasStoreInstance } from './store/store.types.js';

const CanvasInstanceContext = createContext<CanvasStoreInstance | null>(null);

/** Props for {@link CanvasProvider}. */
export interface CanvasProviderProps {
  /** The instance from `createCanvasStore()` — create it once (e.g. `useState(createCanvasStore)`) per mounted canvas. */
  store: CanvasStoreInstance;
  children?: ReactNode;
}

/**
 * Provides one canvas instance to the component tree below it. Everything
 * the enterprise canvas read from module singletons (`useCanvasStore`,
 * `useCanvasHover`, the tool registry, the c4 bridge) resolves through
 * this context instead, so two providers on one page are fully isolated —
 * the store-factory contract of issue #117.
 */
export function CanvasProvider({ store, children }: CanvasProviderProps): ReactNode {
  return (
    <CanvasInstanceContext.Provider value={store}>{children}</CanvasInstanceContext.Provider>
  );
}

/**
 * The raw canvas instance — for imperative access (`instance.getState()`,
 * `instance.tools.register(…)`, `instance.host = …`) from components
 * inside the provider. Throws outside a provider: every such call is a
 * wiring bug, never a legitimate render state.
 */
export function useCanvasInstance(): CanvasStoreInstance {
  const instance = useContext(CanvasInstanceContext);
  if (!instance) {
    throw new Error(
      '@workspec/canvas: useCanvasInstance/useCanvasStore called outside <CanvasProvider>.',
    );
  }
  return instance;
}

/**
 * Subscribe to the canvas store — the context-hook replacement for the
 * enterprise module-level `useCanvasStore`, with the identical call
 * signature (`useCanvasStore()` for the whole state, or
 * `useCanvasStore(selector)` for a slice; contract-tested). Imperative
 * `useCanvasStore.getState()` call sites become
 * `useCanvasInstance().getState()`.
 */
export function useCanvasStore(): CanvasStore;
export function useCanvasStore<T>(selector: (state: CanvasStore) => T): T;
export function useCanvasStore<T>(selector?: (state: CanvasStore) => T): T | CanvasStore {
  const instance = useCanvasInstance();
  // One unconditional useStore call (never a ternary between two hook
  // calls): the no-selector overload falls back to an identity selector,
  // which is referentially safe — it returns the state object itself, so
  // useSyncExternalStore sees a stable snapshot.
  const selectSlice: (state: CanvasStore) => T | CanvasStore = selector ?? identityStore;
  return useStore(instance, selectSlice);
}

function identityStore(state: CanvasStore): CanvasStore {
  return state;
}

/**
 * Subscribe to the instance's ephemeral hover store (separate from the
 * main store so pointermove churn never trips persistence subscribers —
 * see `store/hover.ts`). Same overloads as `useCanvasStore`.
 */
export function useCanvasHover(): CanvasHoverState;
export function useCanvasHover<T>(selector: (state: CanvasHoverState) => T): T;
export function useCanvasHover<T>(
  selector?: (state: CanvasHoverState) => T,
): T | CanvasHoverState {
  const hover = useCanvasInstance().hover;
  const selectSlice: (state: CanvasHoverState) => T | CanvasHoverState =
    selector ?? identityHover;
  return useStore(hover, selectSlice);
}

function identityHover(state: CanvasHoverState): CanvasHoverState {
  return state;
}
