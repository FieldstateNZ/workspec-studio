import type { ConnectionType, Resource } from '@workspec/topology-schema';

/**
 * Severity of an adapter diagnostic. `warning` is the common case (an
 * unmapped vendor type that was skipped); `error` is reserved for input that
 * couldn't be interpreted at all (e.g. the root shape the adapter expects is
 * missing); `info` is available for adapters that want to surface a
 * non-actionable note.
 */
export type DiagnosticSeverity = 'info' | 'warning' | 'error';

/**
 * A local, minimal diagnostic shape every adapter emits alongside its
 * resources. Deliberately not imported from a topology-model-style package:
 * this package's only workspace dependency is `@workspec/topology-schema`
 * (which owns the `Resource` artifact shape, not diagnostics), so a local
 * type avoids inventing a dependency edge this package doesn't otherwise
 * need.
 */
export interface Diagnostic {
  /** How serious this diagnostic is. */
  readonly severity: DiagnosticSeverity;
  /** Human-readable explanation, safe to surface directly in a CLI/UI. */
  readonly message: string;
  /** The source-specific provenance string the diagnostic concerns, if any (e.g. a Terraform address, an ARM resource id). */
  readonly source?: string;
}

/**
 * One connection an adapter can derive directly from edge data in its own
 * source payload. Shaped like `@workspec/topology-schema`'s `Connection`,
 * minus `environments`: a `.topology-actual/<env>/` snapshot (what a CLI/
 * studio phase persists an adapter's output into) is already scoped to
 * exactly one environment by construction, so a per-connection environment
 * subset would be meaningless here — mirrors `@workspec/topology-studio`'s
 * own `DerivedConnection` conversion, which drops the same field for the
 * same reason. `class` reuses `ConnectionType['class']` (not a hand-copied
 * literal union) so a future third connection class can't silently drift
 * between the two packages.
 */
export interface AdapterConnection {
  readonly from: string;
  readonly to: string;
  readonly class: ConnectionType['class'];
}

/**
 * The uniform output every adapter produces: the `Resource` artifacts it
 * managed to derive, plus diagnostics for anything it skipped or couldn't
 * interpret. Resources and diagnostics are independent — a partial import
 * (some resources produced, some types unmapped) is a normal, non-error
 * outcome, not a failure.
 *
 * `connections` is OPTIONAL and, as of this package's three original
 * adapters (terraform/bicep/azure-resource-graph), always absent: none of
 * those source payloads carry edge data at all, so there is nothing to
 * derive — `undefined` means "connectivity not observed", the same
 * "absence is meaningful" convention `@workspec/topology-recon`'s
 * `DerivedTopology.connections` documents on the consuming side (an
 * adapter that doesn't set this key must NOT be treated as having observed
 * an empty graph). The `aspire` adapter is the first with real edge data
 * (the graph's `references[]`) and populates this — see
 * `aspire/derive-aspire-connections.ts`.
 */
export interface AdapterOutput {
  readonly resources: readonly Resource[];
  readonly diagnostics: readonly Diagnostic[];
  readonly connections?: readonly AdapterConnection[];
}

/**
 * The shape every adapter exports: a pure function from an already-parsed
 * JSON value (the caller — a later CLI/studio phase — owns reading the file
 * and `JSON.parse`) to an `AdapterOutput`. No filesystem or network IO
 * happens inside an adapter.
 */
export type Adapter = (input: unknown) => AdapterOutput;
