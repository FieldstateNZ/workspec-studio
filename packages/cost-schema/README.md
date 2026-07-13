# @workspec/cost-schema

Zod source of truth for WorkSpec Cost Attribution artifacts — pricing catalogs, usage records, and
allocation rules. Zero `@workspec` dependencies: this is the base of the module's dependency graph.

Status: C0 bootstrap — this package currently exports only its own package identity
(`COST_SCHEMA_PACKAGE`). The real Zod schemas, YAML parsing, and JSON Schema generation land in a
later slice.

Part of the Cost Attribution module (in progress — see issues C0–C7).

## Dependency direction

`cost-schema` has zero `@workspec` dependencies. Every other `@workspec/cost-*` package depends on
it, directly or transitively — never the reverse.
