# @workspec/decision-schema

The runtime schema for repository-native WorkSpec Decision records.

A Decision lives at `.workspec/decisions/<slug>.yaml`. Its required authored core is:

```yaml
apiVersion: workspec.io/v1alpha1
kind: Decision
metadata:
  slug: choose-a-database
spec:
  title: Choose a database
  status: accepted
  context: The service needs a durable transactional store.
  decision: Use PostgreSQL.
```

Optional fields capture dates, deciders, rationale, consequences, alternatives,
supersession, WorkSpec links, external references, and tags. The root,
`metadata`, and `spec` objects are strict: unknown fields are rejected.

The package exports the Zod schema and inferred types, YAML parsing helpers,
the generated JSON Schema builder, and the three-operation
`DecisionRepositoryPort` (`listDecisions`, `readDecision`, `writeDecision`).

The committed [`decision.schema.json`](../../json-schema/decision.schema.json)
is generated from the runtime schema and kept in parity with the canonical
schema registry. Catalog and pricing primitives remain exported temporarily for
Topology compatibility; they are not part of the Decision record.
