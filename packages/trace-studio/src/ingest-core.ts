// The `ingest` domain core — shared by the CLI's `ingest` command (`cli.ts`'s
// `runIngest`, which reads its `<results-file>` positional off disk before
// calling this) and the `trace_ingest` MCP tool (`mcp-tools/ingest-tool.ts`,
// which has no local filesystem to point a path at, so it passes the results
// text inline as an argument instead). Both then converge on the SAME
// contract this module owns: emitter lookup, run-id derivation/validation,
// running the emitter's own format-agnostic parse (spec §6 — the CLI/tool
// never parses the report itself), schema-validating the derived run, and
// the repository write.

import { posix } from 'node:path';
import { TestRun as TestRunSchema } from '@workspec/req-schema';
import { getEmitter } from '@workspec/trace-emitters';
import type { Emitter } from '@workspec/trace-emitters';
import { EMITTER_NAMES } from './emit-core.js';
import type { TraceRepositoryPort } from './repository.js';

/** Filesystem-safe run id: no path separators, no leading dot. Matches the derived timestamp stem. */
const RUN_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** Derive a filesystem-safe run id from an ISO timestamp (spec §4.5 style: `2026-07-09T02-14-07Z`). */
export function runIdFromTimestamp(ts: string): string {
  return ts.replace(/\.\d+Z$/, 'Z').replace(/:/g, '-');
}

/** Inputs a caller has already extracted from its own arg surface (CLI flags/positional or MCP tool args). */
export interface IngestParams {
  /** The results file's raw text — the CLI reads this off disk; an MCP caller has none, so it is inline. */
  readonly text: string;
  /** Emitter that produced the results — validated against `getEmitter`. */
  readonly emitter: string;
  /** Run id (default: derived from `ts`). */
  readonly id?: string;
  /** ISO-8601 run timestamp (default: `deps.clock()`). */
  readonly ts?: string;
  /** Commit SHA the run executed against. */
  readonly sha?: string;
  /** CI provider label, e.g. `"github-actions"`. */
  readonly ci?: string;
  /** Where to write the run (repo-relative, e.g. `.workspec/.runs`). */
  readonly runsDir: string;
}

/** Dependencies `runIngestCore` needs — a repository, and a clock for the default `ts`. */
export interface IngestDeps {
  readonly repository: TraceRepositoryPort;
  readonly clock: () => string;
}

/** A client-input problem (unknown emitter, a malformed derived id, or a schema-invalid derived run) — never writes. */
export interface IngestUsageError {
  readonly kind: 'usage-error';
  readonly message: string;
}

/** The run parsed/validated fine but the repository write failed. */
export interface IngestWriteError {
  readonly kind: 'write-error';
  readonly ref: string;
  readonly error: unknown;
}

/** Successful outcome: the ref written and the run's pass/fail/skip counts. */
export interface IngestOk {
  readonly kind: 'ok';
  readonly ref: string;
  readonly id: string;
  readonly total: number;
  readonly pass: number;
  readonly fail: number;
  readonly skip: number;
}

export type IngestOutcome = IngestOk | IngestUsageError | IngestWriteError;

/** The subset of {@link IngestParams} known before any results text is available. */
export type IngestArgsToValidate = Pick<IngestParams, 'emitter' | 'id' | 'ts'>;

/** The resolved emitter + derived id/ts, once {@link validateIngestArgs} has confirmed both are usable. */
export interface ValidatedIngestArgs {
  readonly ok: true;
  readonly emitter: Emitter;
  readonly id: string;
  readonly ts: string;
}

export type ValidateIngestArgsResult = ValidatedIngestArgs | { readonly ok: false; readonly error: IngestUsageError };

/**
 * Validates `emitter`/the derived run id WITHOUT needing the results text —
 * so a caller that reads its results file off disk (the CLI) can run this
 * check first and skip the read entirely on a usage error, rather than
 * paying for (and reporting) a read failure that would mask a cheaper,
 * more-relevant usage error underneath it. {@link runIngestCore} calls this
 * same function, so the two validation paths can never drift.
 */
export function validateIngestArgs(
  params: IngestArgsToValidate,
  clock: () => string,
): ValidateIngestArgsResult {
  const emitter = getEmitter(params.emitter);
  if (emitter === undefined) {
    return {
      ok: false,
      error: {
        kind: 'usage-error',
        message: `unknown emitter "${params.emitter}" (available: ${EMITTER_NAMES})`,
      },
    };
  }

  const ts = params.ts ?? clock();
  const id = params.id ?? runIdFromTimestamp(ts);
  if (!RUN_ID_PATTERN.test(id)) {
    return {
      ok: false,
      error: {
        kind: 'usage-error',
        message: `invalid id "${id}" (must be a filename-safe id: no path separators)`,
      },
    };
  }

  return { ok: true, emitter, id, ts };
}

/**
 * Runs `ingest`: validates `params.emitter`/the derived run id (via
 * {@link validateIngestArgs}), hands `params.text` to the emitter's own
 * format-agnostic `ingest`, schema-validates the derived `TestRun`, and
 * writes `<runsDir>/<id>.json`. Never throws for an expected failure — every
 * path resolves to an {@link IngestOutcome}.
 */
export async function runIngestCore(params: IngestParams, deps: IngestDeps): Promise<IngestOutcome> {
  const validated = validateIngestArgs(params, deps.clock);
  if (!validated.ok) {
    return validated.error;
  }
  const { emitter, id, ts } = validated;

  const run = emitter.ingest(params.text, {
    id,
    ts,
    ...(params.sha !== undefined ? { sha: params.sha } : {}),
    ...(params.ci !== undefined ? { ci: params.ci } : {}),
  });

  // Defensive: a bad id/ts combination (or a schema regression in an
  // emitter) would yield an invalid run — reject before writing.
  const validatedRun = TestRunSchema.safeParse(run);
  if (!validatedRun.success) {
    const first = validatedRun.error.issues[0];
    return {
      kind: 'usage-error',
      message: `produced an invalid run: ${first ? first.message : 'schema violation'}`,
    };
  }

  const ref = posix.join(params.runsDir, `${id}.json`);
  try {
    await deps.repository.writeFile(ref, `${JSON.stringify(run, null, 2)}\n`);
  } catch (error) {
    return { kind: 'write-error', ref, error };
  }

  const counts = { pass: 0, fail: 0, skip: 0 };
  for (const verdict of Object.values(run.results)) counts[verdict] += 1;
  const total = Object.keys(run.results).length;

  return { kind: 'ok', ref, id, total, ...counts };
}
