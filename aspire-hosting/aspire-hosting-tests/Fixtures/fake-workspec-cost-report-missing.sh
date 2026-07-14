#!/bin/sh
# Fake workspec-cost CLI: behaves like `report` run against a directory with no inventory/
# attribution artifacts — a usage/precondition error on stderr, no stdout, exit 2 (mirrors
# packages/cost-studio/src/cli.ts's runReport when listInventories()/listAttributions() don't find
# exactly one artifact).
echo 'report: expected exactly 1 inventory, found 0' 1>&2
exit 2
