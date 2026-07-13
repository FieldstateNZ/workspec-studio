# @workspec/cost-studio

WorkSpec Cost Attribution — standalone CLI (`workspec-cost`) and, later, a localhost host shell,
mirroring `@workspec/decision-studio` / `@workspec/c4-studio`.

Status: C0 bootstrap — `workspec-cost` currently only prints a help stub (`help` / `--help` / `-h`
/ no command) and rejects unknown commands. Real subcommands (`validate`, `serve`, ...) land in a
later slice.

Part of the Cost Attribution module (in progress — see issues C0–C7).

## Dependency direction

`cost-studio` depends on `cost-ui`, `cost-engine`, `cost-provider`, and `cost-schema` — the top of
the module's dependency graph.
