// Module-federation expose: `./reactProbe` — a single-React-instance canary for
// the smoke test. React is a shared SINGLETON, so the copy this module resolves
// must be functionally the exact same React the host uses.
//
// Note it does NOT compare the module namespaces by identity: React is
// CommonJS, so `import * as React` produces a per-bundle namespace wrapper — two
// wrappers that differ by identity even when they wrap the SAME shared module.
// The definitive test is a stable *member*: a single shared React means the same
// `useState` function reference and the same internal dispatcher store on both
// sides; two copies would each carry their own (which is exactly what breaks
// hooks with an "invalid hook call"). The host stamps its React onto
// `window.__DS_HOST_REACT`; this probe compares members against it.
import * as React from 'react';

const INTERNALS_KEY = '__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED';

type ReactLike = {
  useState?: unknown;
  version?: string;
  [INTERNALS_KEY]?: unknown;
};

declare global {
  interface Window {
    __DS_HOST_REACT?: unknown;
  }
}

/** Report whether the remote's React is functionally the host-stamped instance. */
export function reactProbe(): { sameInstance: boolean; version: string } {
  const host = (typeof window !== 'undefined' ? window.__DS_HOST_REACT : undefined) as
    ReactLike | undefined;
  const self = React as unknown as ReactLike;

  const sameHooks = host?.useState !== undefined && host.useState === self.useState;
  const sameInternals = host?.[INTERNALS_KEY] === self[INTERNALS_KEY];

  return { sameInstance: sameHooks && sameInternals, version: React.version };
}

export default reactProbe;
