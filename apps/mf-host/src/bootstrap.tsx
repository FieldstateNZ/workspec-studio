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
import { createMemorySource, loadC4Model } from '@workspec/c4-model';
import { layoutDiagram } from '@workspec/c4-layout';
// The hosting-platform fixtures as raw strings, parsed at runtime into the MemoryRepository.
import hostingDecisionYaml from '../../../examples/hosting-platform/hosting-platform.decision.yaml?raw';
import hostingCatalogYaml from '../../../examples/hosting-platform/platform.catalog.yaml?raw';
import './smoke.css';

// Stamp the host React for the single-instance probe (must precede remote loads).
window.__DS_HOST_REACT = React;

// ── Remote modules (shared react/react-dom/react-query → host's instances) ────
const { DecisionStudioProvider, createInertLinkResolver } = await import('decisionStudio/provider');
const DecisionCard = (await import('decisionStudio/DecisionCard')).default;
const DecisionWorkspace = (await import('decisionStudio/DecisionWorkspace')).default;
const { reactProbe } = await import('decisionStudio/reactProbe');
const C4Diagram = (await import('c4Ui/C4Diagram')).default;
const C4Explorer = (await import('c4Ui/C4Explorer')).default;
const { reactProbe: c4ReactProbe } = await import('c4Ui/reactProbe');

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

// ── Seed a tiny in-memory C4 model (loaded through the real @workspec/c4-model
//    pipeline, not a hand-typed lookalike shape) and lay out its one diagram ──
const c4Model = await loadC4Model(
  createMemorySource({
    '.workspec/system/ledger.yaml':
      'title: Ledger\ndescription: Cost tracking and invoicing platform.\n',
    '.workspec/actors/architect.yaml': 'title: Architect\ndescription: Designs systems.\n',
    '.workspec/external-systems/gateway.yaml':
      'title: Payment Gateway\ndescription: Settles invoices.\n',
    '.workspec/diagrams/context.yaml': [
      'title: System Context',
      'type: c4-context',
      'nodes:',
      '  - slug: architect',
      '  - external-system: gateway',
      'edges:',
      '  - from: architect',
      '    to: __system__',
      '    label: designs systems in',
      '    category: identity',
      '  - from: __system__',
      '    to: gateway',
      '    label: settles invoices via',
      '    category: data',
      '',
    ].join('\n'),
  }),
);
const foundC4Diagram = c4Model.diagrams.find((d) => d.slug === 'context');
const foundC4View = foundC4Diagram?.view;
if (!foundC4Diagram || !foundC4View)
  throw new Error('c4-ui smoke: context diagram failed to resolve');
// Fresh `const`s (rather than relying on the guard above narrowing
// `foundC4Diagram`/`foundC4View` inside `C4SmokeApp`, defined further
// down): TypeScript's control-flow narrowing doesn't carry into a function
// body evaluated later, only within the same lexical block.
const c4Diagram = foundC4Diagram;
const c4View = foundC4View;
const c4Positioned = await layoutDiagram({
  nodes: c4View.nodes,
  edges: c4View.edges,
  layout: c4Diagram.layout?.data ?? null,
});

// ── Render ────────────────────────────────────────────────────────────────────
const probe = reactProbe();
const c4Probe = c4ReactProbe();

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

function C4SmokeApp(): React.ReactElement {
  return (
    <div className="smoke-page">
      {/* Single-React canary for the c4-ui remote, read by the Playwright smoke assertion. */}
      <div
        id="c4-react-probe"
        data-same-instance={String(c4Probe.sameInstance)}
        data-remote-react-version={c4Probe.version}
        data-host-react-version={React.version}
      />
      <section id="c4-diagram-mount" className="smoke-section" style={{ height: 420 }}>
        <h2 className="smoke-h">C4Diagram · remote</h2>
        <C4Diagram
          diagram={c4Positioned}
          resolved={c4Diagram}
          spec={c4Model.spec.data}
          theme="dark"
        />
      </section>
      <section id="c4-explorer-mount" className="smoke-section" style={{ height: 420 }}>
        <h2 className="smoke-h">C4Explorer · remote</h2>
        <C4Explorer model={c4Model} theme="dark" />
      </section>
    </div>
  );
}

const container = document.getElementById('root');
if (container === null) throw new Error('#root not found');
createRoot(container).render(
  <>
    <SmokeApp />
    <C4SmokeApp />
  </>,
);
