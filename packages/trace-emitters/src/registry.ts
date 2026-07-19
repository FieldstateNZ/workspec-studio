// The emitter registry — a small, deterministic lookup over the emitters this
// package ships. Adding a framework means adding its `Emitter` here (and nothing
// else downstream): the CLI/UI select by `name` through `getEmitter`.

import { cucumberEmitter } from './cucumber.js';
import { junitEmitter } from './junit.js';
import type { Emitter } from './types.js';

/** Every emitter this package ships, in a stable order: `cucumber`, then `junit`. */
export const emitters: readonly Emitter[] = [cucumberEmitter, junitEmitter];

/** Look up an emitter by its `name` (e.g. `"cucumber"`), or `undefined` if unknown. */
export function getEmitter(name: string): Emitter | undefined {
  return emitters.find((emitter) => emitter.name === name);
}
