// @workspec/trace-ui — host-agnostic React views for the WorkSpec
// Traceability Workbench: Requirements, Feature detail, Matrix, and Run
// review, composed on @workspec/design.
//
// T0 bootstrap skeleton (see docs/traceability/spec.md §7/§8): no views yet
// — they land starting T5. Kept as a plain TS module (no JSX, no
// @workspec/design/React dependency yet) so `pnpm -r build` stays trivial;
// the Tailwind `dist/styles.css` build and module-federation remote-entry
// (`build:mf`) are deferred to that same slice — see tsup.config.ts and the
// package README.

/** This package's own identity (mirrors `@workspec/cost-ui`'s convention). */
export const TRACE_UI_PACKAGE = '@workspec/trace-ui' as const;
