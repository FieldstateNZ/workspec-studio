// Executable entry for the `workspec-decisions` CLI. Kept intentionally thin:
// all logic lives in `run(argv, io)` (testable, IO-injectable); this file is the
// only place that touches `process`. tsup stamps the `#!/usr/bin/env node`
// shebang onto the built output (see tsup.config.ts banner).

import { run } from './cli.js';

run(process.argv.slice(2))
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    process.stderr.write(`workspec-decisions: ${(error as Error).message}\n`);
    process.exitCode = 1;
  });
