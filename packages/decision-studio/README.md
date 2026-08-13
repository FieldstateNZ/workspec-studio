# @workspec/decision-studio

The filesystem, HTTP, CLI, and MCP host for WorkSpec Decision records.

Decision Studio works directly against `.workspec/decisions/<slug>.yaml` in a
repository. Git remains the history and review system; Studio adds no database.

```bash
pnpm exec workspec-decisions serve --dir .
pnpm exec workspec-decisions validate --dir .
pnpm exec workspec-decisions render-adr --dir . --decision choose-a-database
pnpm exec workspec-decisions mcp --dir .
```

The storage seam deliberately has three methods:

```ts
interface DecisionRepositoryPort {
  listDecisions(): Promise<DecisionRef[]>;
  readDecision(ref: Ref): Promise<Decision>;
  writeDecision(ref: Ref, decision: Decision): Promise<void>;
}
```

The localhost API exposes `GET /api/decisions`, `GET /api/decision?ref=…`, and
`PUT /api/decision?ref=…`. The MCP provider exposes list, read, write,
validate, and deterministic ADR rendering tools using the same repository and
schema validation path.

Writes are validated before touching disk, remain contained within the served
repository root, include the canonical schema directive, and preserve YAML
comments where possible.
