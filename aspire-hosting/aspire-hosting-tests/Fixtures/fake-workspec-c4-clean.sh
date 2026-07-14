#!/bin/sh
# Fake workspec-c4 CLI: behaves like a clean run — an empty diagnostics array on stdout, no
# stderr, exit 0. Used by C4 unit tests that need real process execution (WorkspecC4CliRunner.RunAsync
# / WorkspecGraphSyncExtensions.RunImportAspireAsync) without depending on the real TS CLI.
echo '[]'
exit 0
