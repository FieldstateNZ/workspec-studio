// Type declarations for the jest-dom matchers the client (shell) tests call.
// Runtime registration happens in
// `vitest.setup.ts` via `expect.extend(matchers)` — this file only makes
// TypeScript aware those calls are valid.
//
// Mirrors packages/c4-ui/src/testing.d.ts, same rationale in full there:
// jest-dom's shipped `@testing-library/jest-dom/vitest` augmentation targets
// vitest 3's module shape (Assertion declared in `vitest` itself); vitest 4
// re-exports `Assertion` from `@vitest/expect`, so the augmentation never
// merges. Declaring the handful of matchers used here directly against
// `@vitest/expect`'s `Assertion` (its real declaration site) — resolvable
// because `@vitest/expect` is an explicit devDependency pinned to the exact
// version this package's vitest 4.1.10 uses.
export {};

declare module '@vitest/expect' {
  interface Assertion<T = unknown> {
    toBeInTheDocument(): T;
    toHaveAttribute(name: string, value?: string): T;
    toHaveTextContent(text: string | RegExp): T;
    toBeEmptyDOMElement(): T;
    toHaveFocus(): T;
    toHaveClass(...classNames: string[]): T;
    toBeDisabled(): T;
    toBeEnabled(): T;
  }
}
