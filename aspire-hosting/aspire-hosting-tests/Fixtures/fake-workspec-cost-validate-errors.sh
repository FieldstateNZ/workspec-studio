#!/bin/sh
# Fake workspec-cost CLI: behaves like a `validate --json` run that found diagnostics — one error,
# one warning, matching the ValidateDiagnostic shape from packages/cost-studio/src/cli.ts — on
# stdout, exit 1.
cat <<'JSON'
[{"severity":"error","code":"parse-error","message":"invalid resource id","file":"estate.inventory.yaml","line":4,"col":3},{"severity":"warning","code":"mixed-currency","message":"multiple currencies present","file":"estate.attribution.yaml"}]
JSON
exit 1
