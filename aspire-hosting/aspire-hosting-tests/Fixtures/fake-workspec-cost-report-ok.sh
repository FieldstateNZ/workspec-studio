#!/bin/sh
# Fake workspec-cost CLI: behaves like a successful `report --format json` run — a canned
# `{ rollup, coverage, totals }` payload (see @workspec/cost-engine's AttributeResult/Rollup/
# Coverage/Totals shapes) on stdout, exit 0.
cat <<'JSON'
{"rollup":{"dimensionId":"costType","buckets":[{"key":"compute","amount":300},{"key":"storage","amount":700},{"key":"unattributed","amount":100}]},"coverage":[{"dimensionId":"costType","isPrimary":true,"attributedSpend":1000,"unattributedSpend":100,"ratio":0.9090909090909091,"unattributedCount":1,"totalSpend":1100}],"totals":{"totalSpend":1100,"inventorySpend":1100,"orphanSpend":0,"unresolvedSpend":0,"resourcesWithoutSpend":0,"currencies":["USD"]}}
JSON
exit 0
