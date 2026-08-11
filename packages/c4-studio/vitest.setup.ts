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
