#!/bin/sh
# Fake workspec-cost CLI: behaves like a clean `validate --json` run — an empty diagnostics array
# on stdout, no stderr, exit 0. Used by cost unit/command tests that need real process execution
# without depending on the real TS CLI.
echo '[]'
exit 0
