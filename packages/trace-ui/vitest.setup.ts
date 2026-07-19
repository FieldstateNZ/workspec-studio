// jsdom test setup: jest-dom matchers + React Testing Library auto-cleanup.
// Mirrors packages/cost-ui/vitest.setup.ts exactly — see that file's comment
// for why this imports the framework-agnostic `./matchers` export and calls
// `expect.extend()` on vitest's OWN `expect` rather than
// `@testing-library/jest-dom/vitest` (a pnpm-hoisting hazard in this
// monorepo, where sibling packages pin different vitest majors).
import * as matchers from '@testing-library/jest-dom/matchers';
import { cleanup } from '@testing-library/react';
import { afterEach, expect } from 'vitest';

expect.extend(matchers);

afterEach(() => {
  cleanup();
});
