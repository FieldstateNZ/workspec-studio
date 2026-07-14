// Worked example: a TypeScript Aspire AppHost that adds the workspec-c4 studio resource via the
// ATS-exported `AddWorkspecC4`/`WithGraphSync`/`WithModelDiagnosticsHealthCheck` extension methods
// from aspire-hosting/aspire-hosting-c4 (see docs/aspire-hosting/c4-integration.md).
//
// Requirements to actually run this (not exercised by CI in this slice — A6 hardens it):
//   - Aspire CLI >= 13.4. Confirmed by hand: with CLI 13.3.0 (the version available while writing
//     this example), `aspire restore` against a `packages` entry pointed at this package's .csproj
//     fails with:
//       error NU1605: Warning As Error: Detected package downgrade: Aspire.Hosting from 13.4.6 to 13.3.0.
//       error NU1605:  IntegrationRestore -> Aspire.Hosting.Workspec.C4 -> Aspire.Hosting (>= 13.4.6)
//       error NU1605:  IntegrationRestore -> Aspire.Hosting (>= 13.3.0)
//     The CLI's own internal integration-scanning project pins Aspire.Hosting to the CLI's own
//     version (13.3.0), which conflicts with this package's Aspire.Hosting >= 13.4.6 reference
//     (from aspire-hosting/Directory.Packages.props) under NuGet's warnings-as-errors central
//     package management. See docs/aspire-hosting/c4-integration.md's "ATS codegen status" section
//     for the full note; `aspire update` (to realign the CLI to 13.4.6) is the documented fix.
//   - `aspire restore` (or `aspire run`) from this directory, which reads `aspire.config.json`'s
//     `packages` entry for `Aspire.Hosting.Workspec.C4` (pointed at the sibling
//     `../../aspire-hosting/aspire-hosting-c4/Aspire.Hosting.Workspec.C4.csproj` — the
//     "project references for local development" pattern from Aspire's own docs) and generates
//     `.aspire/modules/aspire.mjs`, imported below. `.aspire/` is gitignored — it's regenerated,
//     never committed.
//
// The exact generated method shapes below (positional vs. options-object arguments, enum string
// values) are illustrative, written from the C# signatures shipped in aspire-hosting-c4 and the
// "Multi-language integrations" ATS doc's own examples (required params stay positional, optional
// params with defaults bundle into a trailing options object) — they have NOT been validated
// against a real generated `.d.ts` (see the codegen note above). Treat this file as documentation
// of intent, not a tested integration test.
import { createBuilder } from './.aspire/modules/aspire.mjs';

const builder = await createBuilder();

const c4 = await builder.addWorkspecC4('c4', '.workspec');

// Keeps .workspec/ in sync with this AppHost's own resource graph — Check mode (the default)
// reports drift as a resource state and dashboard console lines without writing anything; pass
// `{ mode: 'scaffold' }` to have the on-run sync write the tree instead. Either way, a "Sync
// .workspec" dashboard command is also registered so scaffold can always be run on demand.
await c4.withGraphSync();

// Opt-in: beyond "is the studio server up" (already covered by AddWorkspecC4's own liveness
// check), this also reflects whether the .workspec/ model itself is valid, by polling the
// studio's own GET /api/model and mapping its diagnostics counts to a health status.
await c4.withModelDiagnosticsHealthCheck();

await builder.build().run();
