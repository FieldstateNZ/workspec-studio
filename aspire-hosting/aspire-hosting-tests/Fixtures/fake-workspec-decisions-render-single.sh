#!/bin/sh
# Fake workspec-decisions CLI: simulates a --dir with EXACTLY ONE decision — `render-adr` (called with
# no --decision, exactly like the "Render ADR" command's discovery run) succeeds outright, mirroring
# the real CLI's `decisions.length === 1` branch (packages/decision-studio/src/cli.ts's
# runRenderAdr). No --decision argument is ever needed in this case.
echo "# ADR: Only Decision"
exit 0
