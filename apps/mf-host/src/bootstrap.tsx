// The smoke host's real entry. It:
//   1. seeds a factory-built MemoryRepository from the hosting-platform fixtures (the same
//      golden data the engine snapshot locks) — and, for Cost Attribution, a
//      compact in-memory estate built inline (see ./cost-seed.ts), and for
//      Topology, a compact in-memory `TopologyFileSource` (see ./topology-seed.ts),
//   2. pulls the provider + view components FROM THE REMOTE over module
//      federation (so provider and views share one module instance — one
//      HostContext, one QueryClient wiring), and
//   3. mounts DecisionCard + DecisionWorkspace inside one DecisionStudioProvider,
//      C4Diagram + C4Explorer over the in-memory C4 model,
//      AttributionWorkbench + CostReport + CostInventory + TagPlanView inside
//      one CostStudioProvider, and TopologyWorkbench inside one
//      TopologyStudioProvider.
//
// Before importing any remote module it stamps the host's React onto
// `window.__DS_HOST_REACT` (read by decision-ui/c4-ui/cost-ui's own
// `reactProbe`s) AND `window.__TP_HOST_REACT` (topology-ui's `reactProbe`
// reads that name instead — see packages/topology-ui/src/mf/reactProbe.ts),
// so each remote's `reactProbe` can assert it sees the exact same React
// instance — the single-React proof the smoke test checks, now for four
// federated module families.

import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { createMemoryRepository, parseDecisionYaml } from '@workspec/decision-schema';
import type { DecisionStudioHost } from '@workspec/decision-ui';
import { createMemorySource, loadC4Model } from '@workspec/c4-model';
import { layoutDiagram } from '@workspec/c4-layout';
import type { CostStudioHost } from '@workspec/cost-ui';
import type { TopologyStudioHost } from '@workspec/topology-ui';
import {
  COST_ATTRIBUTION_REF,
  COST_INVENTORY_REF,
  COST_TAGPLAN_REF,
  createCostSeedRepository,
} from './cost-seed.js';
import { createTopologySeedSource } from './topology-seed.js';
// The hosting-platform fixtures as raw strings, parsed at runtime into the MemoryRepository.
import hostingDecisionYaml from '../../../examples/hosting-platform/.workspec/decisions/hosting-platform.yaml?raw';
import './smoke.css';

// Stamp the host React for the single-instance probe (must precede remote loads).
// Two names: `__DS_HOST_REACT` (decision-ui/c4-ui/cost-ui) and
// `__TP_HOST_REACT` (topology-ui's own convention — see globals.d.ts).
window.__DS_HOST_REACT = React;
window.__TP_HOST_REACT = React;

// ── Remote modules (shared react/react-dom/react-query → host's instances) ────
const { DecisionStudioProvider, createInertLinkResolver } = await import('decisionStudio/provider');
const DecisionCard = (await import('decisionStudio/DecisionCard')).default;
const DecisionWorkspace = (await import('decisionStudio/DecisionWorkspace')).default;
const { reactProbe } = await import('decisionStudio/reactProbe');
const C4Diagram = (await import('c4Ui/C4Diagram')).default;
const C4Explorer = (await import('c4Ui/C4Explorer')).default;
const { reactProbe: c4ReactProbe } = await import('c4Ui/reactProbe');
const { CostStudioProvider, createInertLinkResolver: createCostInertLinkResolver } =
  await import('costStudio/provider');
const AttributionWorkbench = (await import('costStudio/AttributionWorkbench')).default;
const CostReport = (await import('costStudio/CostReport')).default;
const CostInventory = (await import('costStudio/CostInventory')).default;
const TagPlanView = (await import('costStudio/TagPlanView')).default;
const { reactProbe: costReactProbe } = await import('costStudio/reactProbe');
const { TopologyStudioProvider, createInertLinkResolver: createTopologyInertLinkResolver } =
  await import('topologyUi/provider');
const TopologyWorkbench = (await import('topologyUi/TopologyWorkbench')).default;
const { reactProbe: topologyReactProbe } = await import('topologyUi/reactProbe');

// ── Seed the in-memory repository from the hosting-platform fixtures ───────────
const DECISION_REF = '.workspec/decisions/hosting-platform.yaml';

const decision = parseDecisionYaml(hostingDecisionYaml);
if (!decision.ok)
  throw new Error(`hosting decision fixture invalid: ${decision.errors[0]?.message}`);
const repository = createMemoryRepository({
  decisions: { [DECISION_REF]: decision.data },
});

const host: DecisionStudioHost = {
  repository,
  links: createInertLinkResolver(),
  // A read-only mount — the smoke host grants no editing capabilities.
  capabilities: { editDecision: false },
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

// ── Seed the in-memory Cost Attribution repository (compact inline estate) ────
const costRepository = createCostSeedRepository();

const costHost: CostStudioHost = {
  repository: costRepository,
  links: createCostInertLinkResolver(),
  // A writable mount — writes (rule reorder/remove, cluster promotion) go to
  // the in-memory repository above. The smoke test clicks a rule's reorder
  // button and asserts the rail visibly reorders, so `useWriteAttribution`
  // is proven to round-trip through this exact MF seam, not just read from
  // it.
  capabilities: { editAttribution: true },
};

// ── Seed the in-memory Topology file source (compact inline web-app tree) ─────
const topologySource = createTopologySeedSource();

const topologyHost: TopologyStudioHost = {
  source: topologySource,
  links: createTopologyInertLinkResolver(),
  // An authored-only mount — this slice never turns on drag-to-pin layout
  // edits, and the seed above wires no `loadDerived`/`loadCatalog` (the P5
  // drift / P6 cost host inputs are optional extension points the Topology
  // and Cost views render a clean empty state without).
  capabilities: { editLayout: false },
};

// ── Render ────────────────────────────────────────────────────────────────────
const probe = reactProbe();
const c4Probe = c4ReactProbe();
const costProbe = costReactProbe();
const topologyProbe = topologyReactProbe();

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

function CostSmokeApp(): React.ReactElement {
  return (
    <CostStudioProvider host={costHost} theme="dark">
      <div className="smoke-page">
        {/* Single-React canary for the cost-ui remote, read by the Playwright smoke assertion. */}
        <div
          id="cost-react-probe"
          data-same-instance={String(costProbe.sameInstance)}
          data-remote-react-version={costProbe.version}
          data-host-react-version={React.version}
        />
        <section id="cost-workbench-mount" className="smoke-section">
          <h2 className="smoke-h">AttributionWorkbench · remote</h2>
          <AttributionWorkbench
            inventoryRef={COST_INVENTORY_REF}
            attributionRef={COST_ATTRIBUTION_REF}
          />
        </section>
        <section id="cost-report-mount" className="smoke-section">
          <h2 className="smoke-h">CostReport · remote</h2>
          <CostReport inventoryRef={COST_INVENTORY_REF} attributionRef={COST_ATTRIBUTION_REF} />
        </section>
        <section id="cost-inventory-mount" className="smoke-section">
          <h2 className="smoke-h">CostInventory · remote</h2>
          <CostInventory inventoryRef={COST_INVENTORY_REF} attributionRef={COST_ATTRIBUTION_REF} />
        </section>
        <section id="cost-tagplan-mount" className="smoke-section">
          <h2 className="smoke-h">TagPlanView · remote</h2>
          <TagPlanView inventoryRef={COST_INVENTORY_REF} tagPlanRef={COST_TAGPLAN_REF} />
        </section>
      </div>
    </CostStudioProvider>
  );
}

function TopologySmokeApp(): React.ReactElement {
  return (
    <TopologyStudioProvider host={topologyHost} theme="dark">
      <div className="smoke-page">
        {/* Single-React canary for the topology-ui remote, read by the Playwright smoke assertion. */}
        <div
          id="topology-react-probe"
          data-same-instance={String(topologyProbe.sameInstance)}
          data-remote-react-version={topologyProbe.version}
          data-host-react-version={React.version}
        />
        <section id="topology-workbench-mount" className="smoke-section" style={{ height: 640 }}>
          <h2 className="smoke-h">TopologyWorkbench · remote</h2>
          <TopologyWorkbench />
        </section>
      </div>
    </TopologyStudioProvider>
  );
}

const container = document.getElementById('root');
if (container === null) throw new Error('#root not found');
createRoot(container).render(
  <>
    <SmokeApp />
    <C4SmokeApp />
    <CostSmokeApp />
    <TopologySmokeApp />
  </>,
);
