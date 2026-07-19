// Type declarations for the jest-dom matchers this package's tests actually
// call (`toBeInTheDocument`, `toHaveAttribute`, `toHaveClass`,
// `toHaveTextContent`). Runtime registration happens in `vitest.setup.ts` via
// `expect.extend(matchers)` (the real `@testing-library/jest-dom`
// implementations) — this file only makes TypeScript aware those calls are
// valid. See `packages/cost-ui/src/testing.d.ts` (the sibling this mirrors)
// for why this declares directly against `@vitest/expect`'s `Assertion`
// rather than importing jest-dom's own `@testing-library/jest-dom/vitest`
// augmentation (written against vitest 3's shape, which no longer merges
// with vitest 4's `Assertion` re-export).
export {};

declare module '@vitest/expect' {
  interface Assertion<T = unknown> {
    toBeInTheDocument(): T;
    toHaveAttribute(name: string, value?: string): T;
    toHaveClass(...classNames: string[]): T;
    toHaveTextContent(text: string | RegExp): T;
    toBeDisabled(): T;
  }
}
