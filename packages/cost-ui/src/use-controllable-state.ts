// A small controlled/uncontrolled state helper. Every view in this package
// (`AttributionWorkbench` most notably) works standalone with its own
// internal state AND as a controlled child of `CostApp`, which lifts one
// shared `AttributionWorkbenchState` so Reports' stats and Attribution's
// rail agree on the same ephemeral rule toggles. Rather than thread five
// separate controlled/uncontrolled pairs, every stateful view accepts a
// single `state`/`onStateChange` pair through this hook.

import { useCallback, useState } from 'react';

/**
 * `value`/`onChange` behave like a controlled `<input>`: when `value` is
 * defined, this hook is a thin pass-through (state lives in the caller) and
 * `onChange` is still invoked so the caller can react; when `value` is
 * `undefined`, the hook owns the state itself via `useState`.
 */
export function useControllableState<T>(
  value: T | undefined,
  onChange: ((next: T) => void) | undefined,
  defaultValue: T,
): [T, (next: T | ((prev: T) => T)) => void] {
  const [internal, setInternal] = useState<T>(defaultValue);
  const isControlled = value !== undefined;
  const current = isControlled ? value : internal;

  const setValue = useCallback(
    (next: T | ((prev: T) => T)) => {
      const resolved = typeof next === 'function' ? (next as (prev: T) => T)(current) : next;
      if (!isControlled) setInternal(resolved);
      onChange?.(resolved);
    },
    [current, isControlled, onChange],
  );

  return [current, setValue];
}
