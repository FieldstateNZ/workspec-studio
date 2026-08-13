# @workspec/decision-engine

Pure projections for WorkSpec Decision records.

```ts
import { buildAdrModel, renderAdrMarkdown } from '@workspec/decision-engine';

const markdown = renderAdrMarkdown(buildAdrModel(decision, 'choose-a-database'));
```

ADR rendering uses only the authored Decision fields. It performs no catalog
lookup, pricing, scoring, recommendation, evidence synthesis, or AI generation.
The same deterministic renderer is used by the CLI, MCP tool, and browser demo.

`lineEnvCost` remains as a temporary compatibility export for the Topology
module. It is not used by Decision Studio and should move with that pricing
concern in a later extraction.
