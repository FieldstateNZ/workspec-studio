// A hand-authored, representative `.workspec/` tree, loaded through the REAL
// `@workspec/c4-model` pipeline (`createMemorySource` + `loadC4Model`) rather
// than hand-typed lookalike `C4Model`/`ResolvedDiagram` shapes — per the
// fieldstate-testing rule against locally hand-typed domain shapes. Covers:
// every shape (box/cylinder/pill), an external-system (dashed variant), all
// four built-in connection categories, and a three-level drill-down chain
// (context → container → component) via the slug-matches-a-diagram-slug
// convention `C4Explorer.handleNavigate` implements — `__system__`'s
// resolved slug is the system element's own slug ("ledger"), which is also
// the c4-container diagram's slug; the "billing" domain's slug is also the
// c4-component diagram's slug.

import { createMemorySource, loadC4Model } from '@workspec/c4-model';
import type { C4Model } from '@workspec/c4-model';

const TREE: Record<string, string> = {
  // The architect's `~/docs/architecture/README.md` link target — present so
  // `loadC4Model` resolves it cleanly (a `dangling-link` warning would
  // otherwise show up in every test asserting on `model.diagnostics`).
  'docs/architecture/README.md': '# Architecture\n',
  '.workspec/system/ledger.yaml': `
title: Ledger
description: Cost tracking and invoicing platform.
`,
  '.workspec/actors/architect.yaml': `
title: Architect
description: Designs systems and reviews proposed changes.
tags: [human]
links:
  - adr: "~/docs/architecture/README.md"
`,
  '.workspec/external-systems/gateway.yaml': `
title: Payment Gateway
description: Third-party processor used to settle customer invoices.
`,
  '.workspec/domains/billing.yaml': `
title: Billing
description: Pricing, invoicing, and payment reconciliation.
`,
  '.workspec/containers/api.yaml': `
type: container
title: API Server
description: Express API serving the web client.
technology: Node.js
`,
  '.workspec/databases/primary-db.yaml': `
type: database
title: Primary Database
description: Holds all artifacts and application state.
technology: PostgreSQL
`,
  '.workspec/queues/event-bus.yaml': `
type: queue
title: Event Bus
description: Fan-out queue for reconciliation events.
technology: Redis Streams
`,
  '.workspec/features/invoicing.yaml': `
title: Invoicing
description: Generates invoices from approved decisions.
`,
  '.workspec/features/exporting.yaml': `
title: Invoice Export
description: Exports approved invoices as PDF and CSV.
`,
  '.workspec/diagrams/context.yaml': `
title: System Context
type: c4-context
description: Ledger's actors and external systems.
nodes:
  - slug: architect
  - external-system: gateway
edges:
  - from: architect
    to: __system__
    label: designs systems in
    category: identity
  - from: __system__
    to: gateway
    label: settles invoices via
    category: data
`,
  // Slug "ledger" matches the system element's own slug — clicking the
  // injected __system__ node (resolved slug "ledger") in context.yaml
  // navigates here.
  '.workspec/diagrams/ledger.yaml': `
title: Containers
type: c4-container
description: Ledger's domains, containers, database, and event bus.
nodes:
  - domain: billing
  - container: api
  - database: primary-db
  - queue: event-bus
edges:
  - from: api
    to: primary-db
    label: reads/writes
    category: data
    lens: deployment
  - from: billing
    to: event-bus
    label: publishes events
    category: interaction
    lens: logical
  - from: api
    to: event-bus
    label: publishes/consumes
    category: governance
    lens: both
`,
  // Slug "billing" matches the billing domain's own slug — clicking the
  // "billing" node in ledger.yaml navigates here.
  '.workspec/diagrams/billing.yaml': `
title: Billing components
type: c4-component
description: Billing domain's features.
nodes:
  - feature: invoicing
  - feature: exporting
edges:
  - from: invoicing
    to: exporting
    label: triggers
    category: interaction
`,
};

/** Loads the synthetic representative model through the real `@workspec/c4-model` pipeline. */
export async function loadSyntheticModel(): Promise<C4Model> {
  return loadC4Model(createMemorySource(TREE));
}
