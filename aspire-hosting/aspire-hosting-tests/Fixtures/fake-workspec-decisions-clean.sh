#!/bin/sh
# Fake workspec-decisions CLI: behaves like a clean `validate --json` run — an empty diagnostics
# array on stdout, exit 0. Mirrors aspire-hosting-c4's fake-workspec-c4-clean.sh for the Decisions
# integration (WorkspecDecisionsCliRunner.RunAsync / the "validate" dashboard command).
echo '[]'
exit 0
