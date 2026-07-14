#!/bin/sh
# Fake workspec-decisions CLI: simulates a --dir with NO *.decision.yaml files — `render-adr` (called
# with no --decision, the "Render ADR" command's discovery run) fails with the real CLI's "nothing to
# render" message, exit 1. No amount of --decision retrying can fix this: WorkspecDecisionsExtensions'
# ref-resolution fallback must recognize that only a "multiple decisions found" failure (see
# fake-workspec-decisions-render-multi.sh) is worth retrying with a WithDecision-registered ref.
echo "render-adr: no *.decision.yaml found under /fake/dir" 1>&2
exit 1
