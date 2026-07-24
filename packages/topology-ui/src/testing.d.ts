// Type declarations for the jest-dom matchers this package's tests actually
// call (`toBeInTheDocument`, `toHaveAttribute`, `toHaveClass`, `toHaveTextContent`).
// Runtime registration happens in `vitest.setup.ts` via
// `import '@testing-library/jest-dom/vitest'` — this file only makes
// TypeScript aware those calls are valid.
//
// Deliberately NOT relying on jest-dom's own shipped augmentation: that
// declares `module 'vitest' { interface Assertion ... }`, written against
// vitest 3's shape, where `Assertion` was declared directly in the `vitest`
// module. Vitest 4's `vitest` entry only RE-EXPORTS `Assertion` from
// `@vitest/expect`, so that augmentation no longer merges with the interface
// `expect()` actually returns — every matcher call fails to typecheck
// despite working at runtime. Declaring the handful this package uses
// directly against `@vitest/expect`'s `Assertion` (the type's real
// declaration site) sidesteps jest-dom's own type package entirely. Mirrors
// packages/c4-ui/src/testing.d.ts exactly.
export {};

declare module '@vitest/expect' {
  interface Assertion<T = unknown> {
    toBeInTheDocument(): T;
    toHaveAttribute(name: string, value?: string): T;
    toHaveClass(...classNames: string[]): T;
    toHaveTextContent(text: string | RegExp): T;
  }
}
