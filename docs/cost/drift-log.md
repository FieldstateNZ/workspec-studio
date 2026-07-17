# Cost Attribution drift log

Every place this module's schemas, engine, CLI, or UI knowingly diverges from a documented
convention (or from an earlier design assumption) belongs here — a reviewable decision, not an
accident. Mirrors [`docs/c4/drift-log.md`](../c4/drift-log.md)'s own convention and format.

1. **`apps/site`'s `/cost` demo depends on `@workspec/cost-schema`, `@workspec/cost-engine`, and
   `@workspec/cost-ui` as workspace `devDependencies`, not registry pins — a deliberate, temporary
   exception to the site's own registry-pins-only rule.** Every other `@workspec/*` dependency the
   site takes (`decision-schema`, `decision-engine`, `decision-ui`, and, since their own
   resolution, `c4-schema`/`c4-model`/`c4-layout`/`c4-ui`) is a real published version from npm, on
   principle: "if the site builds, the packages work for outside consumers" (see
   `apps/site/package.json`'s own description). The three cost packages above are **not yet
   published** (npm trusted-publisher registration for the six `@workspec/cost-*` packages is
   still pending the first tag-push release — see [`launch-checklist.md`](launch-checklist.md)
   item 1), so pinning a registry version for them is impossible today. Rather than leave `/cost` a
   static stub forever, the demo takes `@workspec/cost-schema`, `@workspec/cost-engine`, and
   `@workspec/cost-ui` as `workspace:*` **devDependencies** (never `dependencies` — they still
   resolve to workspace source at build time, exactly like every other in-repo consumer, not a
   hand-rolled path alias), with a loud comment at the top of `apps/site/package.json`'s
   devDependencies block and this entry. `@workspec/cost-provider`, `@workspec/cost-provider-azure`,
   and `@workspec/cost-studio` are deliberately **not** part of this exception — the site only
   needs the schema, the pure engine, and the UI views to run the in-browser demo; it never talks
   to a real cloud provider or shells out to the CLI. **The decisions and c4 demos' registry pins
   are untouched** — this exception is scoped exclusively to the three cost packages named above.
   One-line change per package at first publish: flip each `workspace:*` entry to the published
   semver range and move it from `devDependencies` to `dependencies` — see
   `launch-checklist.md` item 3 for the exact runbook, mirroring how PR #27 resolved
   `docs/c4/drift-log.md` entry 17 when the c4 family published at `0.1.0-alpha.2`.

   **Resolved 2026-07-17** — the cost family published at `0.1.0-alpha.5` (the unified alpha.5
   release; the first manual `0.1.0-alpha.0` publish shipped a stale build and was superseded).
   `apps/site` now pins `@workspec/cost-schema`, `@workspec/cost-engine`, and `@workspec/cost-ui`
   at `0.1.0-alpha.5` in `dependencies` (moved out of `devDependencies`); the `_LOUD_NOTICE` block,
   the `tsconfig.json` `references` array, and the vite/package.json exception comments are all
   removed. The site now consumes all three from the registry like every other `@workspec/*`
   dependency — no exceptions remaining.
