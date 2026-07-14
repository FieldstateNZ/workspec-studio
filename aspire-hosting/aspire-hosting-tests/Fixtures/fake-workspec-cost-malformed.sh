#!/bin/sh
# Fake workspec-cost CLI: prints stdout that is NOT valid JSON, exit 0 — used to test the "could not
# parse workspec-cost --json output" clean-failure path shared by the Validate and Report dashboard
# commands, without depending on the real TS CLI ever actually misbehaving this way.
echo 'this is not json'
exit 0
