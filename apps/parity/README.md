# @workspec/parity — C4 visual-parity harness (S4, #120)

Playwright screenshot goldens over fixed fixtures rendered through the
recomposed `@workspec/c4-ui` + `@workspec/canvas` engine: card chrome per
kind/state, edge treatment, boundary panel, background grid, and two
full-diagram facade scenes — each in light and dark.

## Running it

```sh
pnpm --filter @workspec/parity parity          # build deps + app, run the goldens
pnpm --filter @workspec/parity parity:update   # same, re-minting the goldens
```

The `parity` script first builds the full workspace dependency closure
(`pnpm --filter @workspec/parity^... run build` — canvas, canvas-c4, c4-ui
and the c4-* model packages, topologically) and then the parity bundle
itself, so the goldens always compare against **fresh** pixels. Without
that, `vite preview` serves whatever stale `dist/` output the workspace
packages last built — a source-level chrome regression can silently pass
(demonstrated in the S4 review with a 5px accent-bar mutation).

## Darwin-only goldens

The committed goldens are `*-chromium-darwin.png` — minted and verified on
macOS only. There is **no linux golden set and no CI wiring**: the suite is
deliberately named `parity` (not `test`) so the root `pnpm -r test` — which
CI runs on ubuntu — skips it, mirroring `apps/mf-host`'s `smoke`
convention. Run it locally on a Mac before merging canvas/c4 chrome
changes. If CI coverage is ever wanted, mint linux goldens in a container
and add a `playwright install` step first.

## Scenario routing

`vite preview` serves the built fixture app on port 4517; scenarios are
hash-routed as `#<scenario>/<theme>` (e.g. `#cards/dark`). See
`src/scenarios.tsx` for the fixture definitions and
`tests/parity.spec.ts` for the golden matrix.
