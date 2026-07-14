#!/bin/sh
# Fake workspec-c4 CLI: behaves like a run that found drift — two canned diagnostics (one error,
# one warning) matching the WorkspecCliDiagnostic/AspireDiagnostic shape, on stdout, exit 1.
cat <<'JSON'
[{"severity":"error","code":"element-missing","message":"Missing element for resource \"api\".","file":".workspec/containers/api.yaml","slug":"api"},{"severity":"warning","code":"field-drift","message":"technology drifted for \"cache\".","file":".workspec/containers/cache.yaml","slug":"cache"}]
JSON
exit 1
