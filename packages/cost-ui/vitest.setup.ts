// jsdom test setup: jest-dom matchers + React Testing Library auto-cleanup.
//
// Deliberately NOT `import '@testing-library/jest-dom/vitest'`: that
// subpath's own `dist/vitest.mjs` does its own `import { expect } from
// 'vitest'` and calls `expect.extend()` on THAT binding. jest-dom does not
// declare `vitest` as a real dependency (only a devDependency, for its own
// test suite), so in this monorepo — where sibling packages pin different
// vitest majors — that import can resolve through pnpm's phantom/hoisted
// node_modules slot rather than THIS package's own `vitest`, landing on
// whichever version happens to be hoisted. The matchers would then extend a
// different `expect` singleton than the one this package's test files
// import, so matcher calls would silently never register. Importing the
// framework-agnostic `./matchers` export and extending `vitest`'s `expect`
// OURSELVES keeps both imports resolving from this package's own
// node_modules, so they're guaranteed to be the same instance. See
// packages/c4-ui/vitest.setup.ts for the sibling this mirrors.
import * as matchers from '@testing-library/jest-dom/matchers';
import { cleanup } from '@testing-library/react';
import { afterEach, expect } from 'vitest';

expect.extend(matchers);

afterEach(() => {
  cleanup();
});
