#!/bin/sh
# Fake workspec-decisions CLI: simulates a --dir with exactly TWO decisions. Handles ONLY `render-adr`
# (this fixture is never asked to `validate`). Called with no --decision (the "Render ADR" command's
# discovery run), it reproduces the real CLI's own ambiguity message verbatim
# (packages/decision-studio/src/cli.ts's runRenderAdr, `decisions.length > 1` branch) so
# WorkspecDecisionsExtensions' ref-resolution fallback has real text to react to. Called with a
# --decision matching one of the two known refs, it renders; with any other value, it reports "no
# decision matching", exactly like the real CLI.
decision=""
prev=""
for arg in "$@"; do
  if [ "$prev" = "--decision" ]; then
    decision="$arg"
  fi
  prev="$arg"
done

if [ -z "$decision" ]; then
  echo "render-adr: multiple decisions found; pass --decision <ref|id>:" 1>&2
  echo "  decisions/pick-a.decision.yaml (pick-a)" 1>&2
  echo "  decisions/pick-b.decision.yaml (pick-b)" 1>&2
  exit 1
fi

case "$decision" in
  decisions/pick-a.decision.yaml)
    echo "# ADR: Pick A"
    exit 0
    ;;
  *)
    echo "render-adr: no decision matching \"$decision\"" 1>&2
    exit 1
    ;;
esac
