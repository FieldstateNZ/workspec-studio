#!/bin/sh
# Fake workspec-decisions CLI: behaves like a `validate --json` run that found problems — one error,
# one warning, matching packages/decision-studio/src/cli.ts's ValidateDiagnostic shape. Unlike C4's
# diagnostics, there is no "slug" field here, only optional line/col (see
# WorkspecDecisionsCliDiagnostic). Exit 1.
cat <<'JSON'
[{"severity":"error","code":"dangling-sku-ref","message":"Option \"cheap\" references unknown SKU \"db.small\".","file":"decisions/pick-db.decision.yaml","line":12,"col":5},{"severity":"warning","code":"dangling-lever-catalogRef-ref","message":"Lever references an unknown catalog entry.","file":"decisions/pick-db.decision.yaml","line":20,"col":3}]
JSON
exit 1
