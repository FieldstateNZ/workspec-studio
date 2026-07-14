#!/bin/sh
# Fake workspec-cost CLI: behaves like a failed `stocktake` run — a usage/write error on stderr, no
# stdout, exit 2.
echo 'stocktake: invalid --name "": must be a valid identifier' 1>&2
exit 2
