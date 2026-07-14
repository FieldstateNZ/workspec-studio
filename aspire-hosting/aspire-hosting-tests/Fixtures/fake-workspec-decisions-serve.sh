#!/bin/sh
# Fake workspec-decisions CLI: `serve` just stays alive quietly — no real HTTP server. Used by runtime
# tests that only need the resource's "http" endpoint to be ALLOCATED (a port number assigned) so a
# WithUrl callback resolves, not for an actual health probe — mirrors the `serve` branch of
# aspire-hosting-c4's fake-workspec-c4-serve-drift.sh.
sleep 300
exit 0
