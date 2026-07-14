#!/bin/sh
# Fake workspec-cost CLI: behaves like a successful `stocktake` run — human-readable summary lines
# on stderr (stocktake never prints JSON to stdout), exit 0.
echo 'stocktake: 1 drift: +1 appeared · −0 disappeared · ~0 tags changed' 1>&2
echo 'stocktake: wrote estate.inventory.yaml, estate.2026-07.spend.yaml' 1>&2
exit 0
