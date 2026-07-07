// Shared test helpers (not part of the published surface — never imported from
// `index.ts`, so tsup does not bundle it). Loads the real hosting-platform example
// artifacts from disk and seeds a factory-built MemoryRepository, so component
// tests assert against the same golden data the engine snapshot locks.

import { render } from '@testing-library/react';
import type { RenderResult } from '@testing-library/react';
import type { ReactElement } from 'react';
import {
  createMemoryRepository,
  parseCatalogYaml,
  parseDecisionYaml,
} from '@workspec/decision-schema';
import type { Catalog, Decision, DecisionRepositoryPort } from '@workspec/decision-schema';
// The real example artifacts, imported as raw strings (Vite `?raw`) so tests run
// against the same golden data the engine snapshot locks — no filesystem access.
import hostingDecisionYaml from '../../../examples/hosting-platform/hosting-platform.decision.yaml?raw';
import hostingCatalogYaml from '../../../examples/hosting-platform/platform.catalog.yaml?raw';
import { DecisionStudioProvider } from './context.js';
import { createInertLinkResolver } from './host.js';
import type { DecisionStudioHost, LinkResolver } from './host.js';
import type { ThemeName } from './themes.js';

/** The stable refs the hosting-platform memory repository is seeded under. */
export const HOSTING_DECISION_REF = 'hosting-platform.decision.yaml';
export const HOSTING_CATALOG_REF = 'platform.catalog.yaml';

/** Parse the hosting-platform decision from the example file (throws on any schema error). */
export function loadHostingDecision(): Decision {
  const parsed = parseDecisionYaml(hostingDecisionYaml);
  if (!parsed.ok)
    throw new Error(`hosting-platform decision fixture invalid: ${parsed.errors[0]?.message}`);
  return parsed.data;
}

/** Parse the hosting-platform catalog from the example file. */
export function loadHostingCatalog(): Catalog {
  const parsed = parseCatalogYaml(hostingCatalogYaml);
  if (!parsed.ok)
    throw new Error(`hosting-platform catalog fixture invalid: ${parsed.errors[0]?.message}`);
  return parsed.data;
}

/** A factory-built MemoryRepository seeded with the hosting-platform decision + catalog. */
export function createHostingRepository(): DecisionRepositoryPort {
  return createMemoryRepository({
    decisions: { [HOSTING_DECISION_REF]: loadHostingDecision() },
    catalogs: { [HOSTING_CATALOG_REF]: loadHostingCatalog() },
  });
}

/** Build a host over a repository, defaulting to the inert link resolver. */
export function createTestHost(
  repository: DecisionRepositoryPort,
  overrides: Partial<DecisionStudioHost> = {},
): DecisionStudioHost {
  return {
    repository,
    links: createInertLinkResolver(),
    capabilities: { editCatalog: false, decide: false },
    ...overrides,
  };
}

/** Render `ui` inside a provider over `host`, with a fresh theme. */
export function renderWithHost(
  ui: ReactElement,
  options: { host: DecisionStudioHost; theme?: ThemeName } = {
    host: createTestHost(createHostingRepository()),
  },
): RenderResult {
  return render(
    <DecisionStudioProvider host={options.host} theme={options.theme}>
      {ui}
    </DecisionStudioProvider>,
  );
}

export { createInertLinkResolver };
export type { LinkResolver };
