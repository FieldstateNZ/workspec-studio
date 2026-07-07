// The smoke host's real entry. It:
//   1. seeds a factory-built MemoryRepository from the hosting-platform fixtures (the same
//      golden data the engine snapshot locks),
//   2. pulls the provider + view components FROM THE REMOTE over module
//      federation (so provider and views share one module instance — one
//      HostContext, one QueryClient wiring), and
//   3. mounts DecisionCard + DecisionWorkspace inside one DecisionStudioProvider.
//
// Before importing any remote module it stamps the host's React onto
// `window.__DS_HOST_REACT`, so the remote's `reactProbe` can assert it sees the
// exact same React instance — the single-React proof the smoke test checks.

import * as React from 'react';
import { createRoot } from 'react-dom/client';
import {
  createMemoryRepository,
  parseCatalogYaml,
  parseDecisionYaml,
} from '@workspec/decision-schema';
import type { DecisionStudioHost } from '@workspec/decision-ui';
// The hosting-platform fixtures as raw strings, parsed at runtime into the MemoryRepository.
import hostingDecisionYaml from '../../hosting-platform/hosting-platform.decision.yaml?raw';
import hostingCatalogYaml from '../../hosting-platform/platform.catalog.yaml?raw';
import './smoke.css';

// Stamp the host React for the single-instance probe (must precede remote loads).
window.__DS_HOST_REACT = React;

// ── Remote modules (shared react/react-dom/react-query → host's instances) ────
const { DecisionStudioProvider, createInertLinkResolver } = await import('decisionStudio/provider');
const DecisionCard = (await import('decisionStudio/DecisionCard')).default;
const DecisionWorkspace = (await import('decisionStudio/DecisionWorkspace')).default;
const { reactProbe } = await import('decisionStudio/reactProbe');

// ── Seed the in-memory repository from the hosting-platform fixtures ───────────
const DECISION_REF = 'hosting-platform.decision.yaml';
const CATALOG_REF = 'platform.catalog.yaml';

const decision = parseDecisionYaml(hostingDecisionYaml);
if (!decision.ok)
  throw new Error(`hosting decision fixture invalid: ${decision.errors[0]?.message}`);
const catalog = parseCatalogYaml(hostingCatalogYaml);
if (!catalog.ok) throw new Error(`hosting catalog fixture invalid: ${catalog.errors[0]?.message}`);

const repository = createMemoryRepository({
  decisions: { [DECISION_REF]: decision.data },
  catalogs: { [CATALOG_REF]: catalog.data },
});

const host: DecisionStudioHost = {
  repository,
  links: createInertLinkResolver(),
  // A read-only mount — the smoke host grants no editing capabilities.
  capabilities: { editCatalog: false, decide: false },
};

// ── Render ────────────────────────────────────────────────────────────────────
const probe = reactProbe();

function SmokeApp(): React.ReactElement {
  return (
    <DecisionStudioProvider host={host} theme="dark">
      <div className="smoke-page">
        {/* Single-React canary, read by the Playwright smoke assertion. */}
        <div
          id="react-probe"
          data-same-instance={String(probe.sameInstance)}
          data-remote-react-version={probe.version}
          data-host-react-version={React.version}
        />
        <section id="card-mount" className="smoke-section">
          <h2 className="smoke-h">DecisionCard · remote</h2>
          <DecisionCard decisionRef={DECISION_REF} />
        </section>
        <section id="workspace-mount" className="smoke-section">
          <h2 className="smoke-h">DecisionWorkspace · remote</h2>
          <DecisionWorkspace decisionRef={DECISION_REF} />
        </section>
      </div>
    </DecisionStudioProvider>
  );
}

const container = document.getElementById('root');
if (container === null) throw new Error('#root not found');
createRoot(container).render(<SmokeApp />);
