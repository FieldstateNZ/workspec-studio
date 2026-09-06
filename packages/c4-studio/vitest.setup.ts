// Shared test setup: jest-dom matchers + React Testing Library auto-cleanup
// for the jsdom (client/) suites; the node-env src/ suites load it too, so
// every DOM touch below is guarded.
//
// Deliberately NOT `import '@testing-library/jest-dom/vitest'` — the same
// same-`expect`-singleton rationale as packages/c4-ui/vitest.setup.ts (that
// subpath extends whatever `vitest` instance pnpm happens to hoist, which in
// this monorepo of mixed vitest majors can be a DIFFERENT singleton than the
// one these test files import, silently registering nothing).
import * as matchers from '@testing-library/jest-dom/matchers';
import { cleanup } from '@testing-library/react';
import { afterEach, expect } from 'vitest';

expect.extend(matchers);

afterEach(() => {
  cleanup();
});

// The A3 authoring suites (client/authoring.test.tsx) drive the real
// @workspec/canvas pointer pipeline, which measures its root with
// ResizeObserver and captures pointers — neither exists in jsdom. Same
// stubs, same reason, as packages/c4-ui/vitest.setup.ts; guarded so the
// node-env src/ suites sharing this file are unaffected.
class ResizeObserverStub {
  observe(): void {
    /* noop */
  }
  unobserve(): void {
    /* noop */
  }
  disconnect(): void {
    /* noop */
  }
}
(globalThis as { ResizeObserver?: unknown }).ResizeObserver = ResizeObserverStub;
if (typeof HTMLElement !== 'undefined') {
  HTMLElement.prototype.setPointerCapture = () => undefined;
  HTMLElement.prototype.releasePointerCapture = () => undefined;
}
