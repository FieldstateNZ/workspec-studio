#!/bin/sh
# Fake workspec-c4 CLI: behaves like a successful `--mode scaffold` run — human-readable "wrote"
# lines on stderr (scaffold mode never prints JSON to stdout, per the CLI's own contract), exit 0.
echo "wrote .workspec/containers/api.yaml" 1>&2
echo "wrote .workspec/containers/cache.yaml" 1>&2
exit 0
