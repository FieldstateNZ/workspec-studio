// Type declarations for the jest-dom matchers this package's tests actually
// call (`toBeInTheDocument`, `toHaveAttribute`, `toHaveClass`). Runtime
// registration happens in `vitest.setup.ts` via `expect.extend(matchers)`
// (the real `@testing-library/jest-dom` implementations) — this file only
// makes TypeScript aware those calls are valid.
//
// Deliberately NOT `import '@testing-library/jest-dom/vitest'` (jest-dom's
// own shipped augmentation): that declares `module 'vitest' { interface
// Assertion ... }`, written against vitest 3's shape, where `Assertion` was
// declared directly in the `vitest` module. Vitest 4's `vitest` entry only
// RE-EXPORTS `Assertion` from `@vitest/expect` (`export { Assertion, ... }
// from '@vitest/expect'`), so that augmentation no longer merges with the
// interface `expect()` actually returns — every matcher call fails to
// typecheck despite working at runtime. Declaring the handful this package
// uses directly against `@vitest/expect`'s `Assertion` (the type's real
// declaration site, independent of how `vitest` re-exports it) sidesteps
// jest-dom's own type package entirely rather than fighting its exports map
// for a deep import to its internal (unexported) matcher-namespace type.
//
// This only resolves correctly because `@vitest/expect` is ALSO an explicit
// devDependency below (pinned to the exact version vitest 4.1.10 itself
// uses): jest-dom does not declare `vitest`/`@vitest/expect` as real
// dependencies (only devDependencies, for its own test suite), and this
// monorepo's sibling packages pin different vitest majors — so without an
// explicit direct dependency here, both `@testing-library/jest-dom`'s own
// import of `vitest` and a bare `declare module '@vitest/expect'` in this
// file resolve through pnpm's phantom/hoisted node_modules slot, landing on
// whichever version happens to be hoisted (observed: the OTHER package's
// 3.x) rather than this package's own 4.x.
export {};

declare module '@vitest/expect' {
  interface Assertion<T = unknown> {
    toBeInTheDocument(): T;
    toHaveAttribute(name: string, value?: string): T;
    toHaveClass(...classNames: string[]): T;
  }
}
