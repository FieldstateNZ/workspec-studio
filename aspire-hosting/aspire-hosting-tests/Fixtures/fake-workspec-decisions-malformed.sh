#!/bin/sh
# Fake workspec-decisions CLI: simulates a `validate --json` run whose stdout is NOT valid JSON — used
# to prove AddWorkspecDecisions' "validate" command degrades to a clean CommandResults.Failure instead
# of throwing when JSON parsing fails (see its executeCommand's catch (JsonException) branch).
echo 'not-json-output-\|<>'
exit 1
