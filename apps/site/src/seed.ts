// Seed data for the in-browser demo. The two worked examples are vendored as
// raw YAML and parsed at runtime into a single MemoryRepository, so the demo
// runs with zero network calls after load. The YAML is a verbatim copy of the
// repository's `examples/` — the same artifacts the CLI and tests use.
import {
  createMemoryRepository,
  parseDecisionYaml,
  type Decision,
  type DecisionRepositoryPort,
  type Ref,
} from '@workspec/decision-schema';

import hostingDecisionYaml from './examples/hosting-platform.decision.yaml?raw';
import postgresDecisionYaml from './examples/postgres-hosting.decision.yaml?raw';

const HOSTING_DECISION_REF: Ref = 'hosting-platform.decision.yaml';
const POSTGRES_DECISION_REF: Ref = 'postgres-hosting.decision.yaml';

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
      'A proposed platform decision with its context, rationale, consequences, and alternatives.',
    decisionRef: HOSTING_DECISION_REF,
  },
  {
    key: 'postgres',
    label: 'Managed vs self-hosted Postgres',
    blurb: 'An accepted managed PostgreSQL decision with the rejected alternatives preserved.',
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
  });
}
