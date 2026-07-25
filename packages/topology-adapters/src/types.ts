import type { Resource } from '@workspec/topology-schema';

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
 * The uniform output every adapter produces: the `Resource` artifacts it
 * managed to derive, plus diagnostics for anything it skipped or couldn't
 * interpret. Resources and diagnostics are independent — a partial import
 * (some resources produced, some types unmapped) is a normal, non-error
 * outcome, not a failure.
 */
export interface AdapterOutput {
  readonly resources: readonly Resource[];
  readonly diagnostics: readonly Diagnostic[];
}

/**
 * The shape every adapter exports: a pure function from an already-parsed
 * JSON value (the caller — a later CLI/studio phase — owns reading the file
 * and `JSON.parse`) to an `AdapterOutput`. No filesystem or network IO
 * happens inside an adapter.
 */
export type Adapter = (input: unknown) => AdapterOutput;
