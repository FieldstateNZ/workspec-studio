#!/bin/sh
# Fake workspec-c4 CLI: hangs (far longer than any test timeout) without producing output — used to
# test WorkspecC4CliRunner.RunAsync's timeout kill path. The runner must kill the whole process tree
# (this shell AND its sleep child) and degrade, never hang.
sleep 300
exit 0
