import { z } from 'zod';

/**
 * A single verdict a run reports for a system-requirement. `pass` / `fail` /
 * `skip` — and *absence* of a key (see `TestRun.results`) — are four distinct
 * states. Absence means "unproven", but that is a derivation the model layer
 * makes; the schema only records the three explicit verdicts.
 */
export const TestResult = z
  .enum(['pass', 'fail', 'skip'])
  .describe(
    'A per-sysreq verdict: pass | fail | skip. Absence of a key is a distinct fourth state.',
  );

/**
 * The `TestRun` / evidence shape (traceability spec §4.5): ingested, never
 * authored. Produced by `workspec-trace ingest` from a test toolchain's
 * output (Cucumber JSON / JUnit XML). Machine-ingested JSON — so it is a FLAT
 * object, NOT a `defineArtifact` K8s envelope.
 *
 * `results` **keys on the sysreq slug alone** — because the file IS the
 * scenario there is no composite `<sysreq>/<id>` key and no scenario id to
 * stabilise. `pass` / `fail` / `skip` / *absence* are distinct; absence (the
 * slug not being a key) means the sysreq is unproven, which the model layer
 * derives — not the schema.
 *
 * The on-disk home (`.runs/`, default gitignored per spec §9.3) is deferred to
 * the ingest CLI (T4) and is deliberately NOT encoded here.
 */
export const TestRun = z
  .object({
    id: z
      .string()
      .min(1)
      .describe('Run identifier, e.g. the run timestamp stem "2026-07-09T02-14Z".'),
    ts: z.string().datetime().describe('ISO-8601 datetime the run was produced.'),
    sha: z.string().optional().describe('Optional commit SHA the run executed against.'),
    ci: z.string().optional().describe('Optional CI provider label, e.g. "github-actions".'),
    emitter: z
      .string()
      .min(1)
      .describe('The emitter convention that produced these results, e.g. "cucumber" or "junit".'),
    results: z
      .record(z.string(), TestResult)
      .describe(
        'Per-sysreq verdicts keyed on the sysreq slug alone. Absence of a slug key means unproven (derived at the model layer).',
      ),
  })
  .describe(
    'An ingested test run (evidence). Machine-produced JSON, never authored; keyed on sysreq slug.',
  );

/** Inferred type of a single per-sysreq verdict. */
export type TestResult = z.infer<typeof TestResult>;

/** Inferred type of an ingested test run. */
export type TestRun = z.infer<typeof TestRun>;
