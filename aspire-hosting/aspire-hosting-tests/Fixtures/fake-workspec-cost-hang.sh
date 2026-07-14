#!/bin/sh
# Fake workspec-cost CLI: hangs (far longer than any test timeout) without producing output — used
# to test WorkspecCostCliRunner.RunAsync's timeout kill path. The runner must kill the whole process
# tree (this shell AND its sleep child) and degrade, never hang.
sleep 300
exit 0
