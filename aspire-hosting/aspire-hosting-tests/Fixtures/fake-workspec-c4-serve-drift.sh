#!/bin/sh
# Fake workspec-c4 CLI for the WithGraphSync state-regression test: `serve` stays alive quietly
# (a stand-in for the real studio server — no HTTP needed by that test), while `import-aspire`
# reports two drift diagnostics like fake-workspec-c4-drift.sh. One script handles both because the
# real integration invokes the SAME resolved CLI for the resource's serve process and for graph sync.
case "$1" in
  serve)
    sleep 300
    ;;
  import-aspire)
    cat <<'JSON'
[{"severity":"error","code":"element-missing","message":"Missing element for resource \"api\".","file":".workspec/containers/api.yaml","slug":"api"},{"severity":"warning","code":"field-drift","message":"technology drifted for \"cache\".","file":".workspec/containers/cache.yaml","slug":"cache"}]
JSON
    exit 1
    ;;
esac
exit 0
