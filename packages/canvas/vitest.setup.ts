// jsdom test setup: jest-dom matchers + React Testing Library auto-cleanup.
//
// Deliberately NOT `import '@testing-library/jest-dom/vitest'`: that
// subpath's own `dist/vitest.mjs` does its own `import { expect } from
// 'vitest'` and calls `expect.extend()` on THAT binding. jest-dom does not
// declare `vitest` as a real dependency (only a devDependency, for its own
// test suite), so in this monorepo — where sibling packages pin different
// vitest majors (packages/decision-ui stays on 3.x; this package needs 4.x)
// — that import resolves through pnpm's phantom/hoisted node_modules slot
// rather than THIS package's own `vitest`, landing on whichever version
// happens to be hoisted. The matchers then extend a different `expect`
// singleton than the one this package's test files import, so
// `toHaveAttribute` etc. silently never registers. Importing the
// framework-agnostic `./matchers` export and extending `vitest`'s `expect`
// OURSELVES keeps both imports resolving from this package's own
// node_modules, so they're guaranteed to be the same instance. Mirrors
// packages/topology-ui/vitest.setup.ts exactly.
import * as matchers from '@testing-library/jest-dom/matchers';
import { cleanup } from '@testing-library/react';
import { afterEach, expect } from 'vitest';

expect.extend(matchers);

afterEach(() => {
  cleanup();
});
