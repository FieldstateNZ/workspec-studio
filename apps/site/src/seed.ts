// Seed data for the in-browser demo. The two worked examples are vendored as
// raw YAML and parsed at runtime into a single MemoryRepository, so the demo
// runs with zero network calls after load. The YAML is a verbatim copy of the
// repository's `examples/` — the same artifacts the CLI and tests use.
import {
  createMemoryRepository,
  parseCatalogYaml,
  parseDecisionYaml,
  type Catalog,
  type Decision,
  type DecisionRepositoryPort,
  type Ref,
} from '@workspec/decision-schema';

import hostingDecisionYaml from './examples/hosting-platform.decision.yaml?raw';
import hostingCatalogYaml from './examples/platform.catalog.yaml?raw';
import postgresDecisionYaml from './examples/postgres-hosting.decision.yaml?raw';
import postgresCatalogYaml from './examples/postgres.catalog.yaml?raw';

const HOSTING_DECISION_REF: Ref = 'hosting-platform.decision.yaml';
const HOSTING_CATALOG_REF: Ref = 'platform.catalog.yaml';
const POSTGRES_DECISION_REF: Ref = 'postgres-hosting.decision.yaml';
const POSTGRES_CATALOG_REF: Ref = 'postgres.catalog.yaml';

export interface DemoExample {
  /** Stable key for the example switcher. */
  key: string;
  /** Tab label. */
  label: string;
  /** One-line framing shown beneath the switcher. */
  blurb: string;
  /** The ref the decision is stored under in the shared repository. */
  decisionRef: Ref;
}

export const DEMO_EXAMPLES: readonly DemoExample[] = [
  {
    key: 'hosting',
    label: 'Hosting platform',
    blurb:
      'Four hosting options (AKS / App Service / ASE / Container Apps) costed across dev / test / prod — the golden fixture.',
    decisionRef: HOSTING_DECISION_REF,
  },
  {
    key: 'postgres',
    label: 'Managed vs self-hosted Postgres',
    blurb:
      'Managed PaaS vs HA vs self-hosted on Kubernetes — a decided record where cheapest ≠ chosen.',
    decisionRef: POSTGRES_DECISION_REF,
  },
];

function parseDecision(ref: Ref, yaml: string): Decision {
  const result = parseDecisionYaml(yaml);
  if (!result.ok) {
    throw new Error(
      `demo seed: decision "${ref}" invalid — ${result.errors[0]?.message ?? 'unknown'}`,
    );
  }
  return result.data;
}

function parseCatalog(ref: Ref, yaml: string): Catalog {
  const result = parseCatalogYaml(yaml);
  if (!result.ok) {
    throw new Error(
      `demo seed: catalog "${ref}" invalid — ${result.errors[0]?.message ?? 'unknown'}`,
    );
  }
  return result.data;
}

/**
 * A fresh in-memory repository preloaded with BOTH worked examples. Each call
 * returns an isolated repository so a "reset" fully discards in-browser edits.
 */
export function createDemoRepository(): DecisionRepositoryPort {
  return createMemoryRepository({
    decisions: {
      [HOSTING_DECISION_REF]: parseDecision(HOSTING_DECISION_REF, hostingDecisionYaml),
      [POSTGRES_DECISION_REF]: parseDecision(POSTGRES_DECISION_REF, postgresDecisionYaml),
    },
    catalogs: {
      [HOSTING_CATALOG_REF]: parseCatalog(HOSTING_CATALOG_REF, hostingCatalogYaml),
      [POSTGRES_CATALOG_REF]: parseCatalog(POSTGRES_CATALOG_REF, postgresCatalogYaml),
    },
  });
}
