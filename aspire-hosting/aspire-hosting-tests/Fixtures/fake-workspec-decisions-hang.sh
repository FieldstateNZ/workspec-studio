#!/bin/sh
# Fake workspec-decisions CLI: hangs (far longer than any test timeout) without producing output —
# used to test WorkspecDecisionsCliRunner.RunAsync's timeout kill path (the private internal copy of
# aspire-hosting-c4's identical safety property — see the TODO(A6, #39) consolidation note on
# WorkspecDecisionsCliRunner). The runner must kill the whole process tree and degrade, never hang.
sleep 300
exit 0
