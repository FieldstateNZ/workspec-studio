// Latest-run selection: pick the one run all scenario evidence joins off, with
// a fully deterministic tiebreak (spec §9.4: v0 is latest-run-only).

import type { TestRun } from '@workspec/req-schema';
import type { RunRef } from './types.js';

/** Pick the latest run: max timestamp, ties broken by the greater id. Pure, no clock. */
export function selectLatestRun(runs: readonly TestRun[]): TestRun | null {
  let latest: TestRun | null = null;
  let latestTime = Number.NEGATIVE_INFINITY;
  for (const run of runs) {
    const parsed = Date.parse(run.ts);
    const time = Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
    if (latest === null) {
      latest = run;
      latestTime = time;
      continue;
    }
    if (time > latestTime) {
      latest = run;
      latestTime = time;
    } else if (time === latestTime) {
      // Deterministic tiebreak on equal (or unparseable) timestamps.
      if (run.ts > latest.ts || (run.ts === latest.ts && run.id > latest.id)) {
        latest = run;
        latestTime = time;
      }
    }
  }
  return latest;
}

/** Denormalise a `TestRun`'s identity onto the model (`RunRef`), so consumers needn't re-scan `runs`. */
export function toRunRef(run: TestRun): RunRef {
  return {
    id: run.id,
    ts: run.ts,
    emitter: run.emitter,
    ...(run.sha !== undefined ? { sha: run.sha } : {}),
    ...(run.ci !== undefined ? { ci: run.ci } : {}),
  };
}
