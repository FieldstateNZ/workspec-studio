// The parity scenarios (#120): deterministic fixtures per visual surface —
// card chrome per kind + state, edge treatment (routes, labels, category
// accents), boundary panel, and two full-diagram scenes mirroring the
// enterprise reference screenshots (system context; container lens).
// Every scenario renders in light or dark via the C4 themed root.

import { useEffect, useState, type FC, type ReactNode } from 'react';
import {
  Canvas,
  CanvasProvider,
  CanvasSpecContext,
  createCanvasStore,
  ConnectorLayer,
  ShapeLayer,
  type CanvasStoreInstance,
} from '@workspec/canvas';
import {
  buildC4Shapes,
  buildCanvasSpec,
  nodeShapeId,
  registerC4,
  C4Diagram,
  THEMES,
} from '@workspec/c4-ui';
import type { ThemeName } from '@workspec/c4-ui';
import { layoutDiagram, type PositionedDiagram } from '@workspec/c4-layout';
import type { ResolvedDiagram, ResolvedDiagramNode } from '@workspec/c4-model';
import type { Diagram } from '@workspec/c4-schema';

export type Theme = ThemeName;

function themedFrame(theme: Theme, children: ReactNode): ReactNode {
  const tokens = THEMES[theme];
  const style: Record<string, string> = { ...tokens };
  return (
    <div
      className={theme === 'dark' ? 'c4-root wsc-root dark' : 'c4-root wsc-root'}
      data-aesthetic="console"
      data-theme={theme}
      data-parity-frame
      style={{
        ...(style as object),
        position: 'relative',
        width: 1240,
        minHeight: 780,
        background: 'var(--canvas-bg)',
        padding: 20,
        boxSizing: 'border-box',
        fontFamily: 'var(--sans)',
      }}
    >
      {children}
    </div>
  );
}

function rnode(
  nodeId: string,
  kind: string,
  title: string,
  description: string | null = null,
  position: { x: number; y: number } | null = null,
): ResolvedDiagramNode {
  return {
    nodeId,
    slug: nodeId,
    kind,
    title,
    description,
    technology: null,
    tags: [],
    position,
    injected: false,
    dangling: false,
  };
}

function rdiagram(
  slug: string,
  type: string,
  title: string,
  nodes: ResolvedDiagramNode[],
  edges: {
    from: string;
    to: string;
    label?: string;
    category?: string;
    lens?: 'logical' | 'deployment' | 'both';
  }[],
): ResolvedDiagram {
  return {
    slug,
    path: `diagrams/${slug}.yaml`,
    title,
    type,
    description: null,
    raw: {} as Diagram,
    view: {
      nodes,
      edges: edges.map((e) => ({
        from: e.from,
        to: e.to,
        label: e.label ?? null,
        category: e.category ?? null,
        lens: e.lens ?? null,
        dangling: false,
      })),
    },
    lensViews: null,
    layout: null,
  };
}

/** A canvas instance seeded with a projection at a fixed identity camera. */
function useSeededInstance(
  seed: (instance: CanvasStoreInstance) => void,
): CanvasStoreInstance {
  const [instance] = useState(() => {
    const inst = createCanvasStore();
    registerC4(inst);
    seed(inst);
    return inst;
  });
  return instance;
}

const SPEC = buildCanvasSpec(undefined);

const CanvasScene: FC<{
  seed: (instance: CanvasStoreInstance) => void;
  height?: number;
}> = ({ seed, height = 700 }) => {
  const instance = useSeededInstance(seed);
  return (
    <div style={{ position: 'relative', width: 1200, height }}>
      <CanvasProvider store={instance}>
        <CanvasSpecContext.Provider value={SPEC}>
          <Canvas shortcutScope="none" renderContextMenu={() => null}>
            <ConnectorLayer />
            <ShapeLayer />
          </Canvas>
        </CanvasSpecContext.Provider>
      </CanvasProvider>
    </div>
  );
};

// ── Scenario: card chrome per kind + state ──────────────────────────────────

// Scene height clears the LAST state row completely: the reworking card's
// bottom edge sits at y 660+110=770 and its dashed halo extends 16px past
// it (786) — plus the Inked/Reworking footer bar chrome INSIDE the card
// that the previous 740px frame cut off. 830 keeps the full card + halo in
// frame so the golden actually pins the reworking affordances (S4 fix
// round adjacent).
const CardsScenario: FC = () => (
  <CanvasScene
    height={830}
    seed={(inst) => {
      const nodes = [
        rnode('sys', 'system', 'Fieldstate Ledger', 'The primary system.', { x: 20, y: 20 }),
        rnode('act', 'actor', 'Architect', 'Designs the system.', { x: 360, y: 20 }),
        rnode('ext', 'external-system', 'Payment Gateway', 'Third-party billing.', {
          x: 700,
          y: 20,
        }),
        rnode('web', 'container', 'Web App', 'React + Vite SPA.', { x: 20, y: 170 }),
        rnode('dom', 'domain', 'Billing', 'Invoices and settlement.', { x: 360, y: 170 }),
        rnode('db', 'database', 'Postgres', 'Primary store.', { x: 700, y: 170 }),
        rnode('q', 'queue', 'Event Bus', 'Async fan-out.', { x: 20, y: 320 }),
        rnode('feat', 'component', 'Invoice Builder', 'Feature-aliased kind.', { x: 360, y: 320 }),
        rnode('cls', 'class', 'LedgerEntry', 'Code-level element.', { x: 700, y: 320 }),
        // State row: selected / hovered / drafted / reworking.
        rnode('sel', 'container', 'Selected State', 'Accent ring + glow.', { x: 20, y: 490 }),
        rnode('hov', 'container', 'Hovered State', 'Dashed accent outline.', { x: 360, y: 490 }),
        rnode('drf', 'container', 'Drafted State', 'Pencil chip.', { x: 700, y: 490 }),
        rnode('rwk', 'container', 'Reworking State', 'Orange halo.', { x: 20, y: 660 }),
      ];
      const resolved = rdiagram('cards', 'c4-context', 'Cards', nodes, []);
      const projection = buildC4Shapes(resolved, {
        draftedSlugs: new Set(['drf']),
        reworkingMap: new Map([['rwk', { reworking: true, canvasObjectId: 'co-1' }]]),
      });
      inst.getState()._setShapesRaw(projection.shapes);
      inst.getState().select([nodeShapeId('sel')], 'replace');
      inst.hover.getState().setHovered(nodeShapeId('hov'));
    }}
  />
);

// ── Scenario: edge treatment ────────────────────────────────────────────────

const EdgesScenario: FC = () => (
  <CanvasScene
    seed={(inst) => {
      const nodes = [
        rnode('a', 'container', 'Source A', null, { x: 20, y: 40 }),
        rnode('b', 'container', 'Target B', null, { x: 620, y: 40 }),
        rnode('c', 'container', 'Below C', null, { x: 20, y: 420 }),
        rnode('d', 'database', 'Data Store', null, { x: 620, y: 420 }),
        rnode('block', 'container', 'In The Way', null, { x: 330, y: 200 }),
        rnode('hub', 'system', 'Fan Target', null, { x: 330, y: 560 }),
      ];
      const resolved = rdiagram('edges', 'c4-context', 'Edges', nodes, [
        { from: 'a', to: 'b', label: 'interaction Z', category: 'interaction' },
        { from: 'a', to: 'd', label: 'detours', category: 'data' },
        { from: 'c', to: 'd', label: 'data flow', category: 'data' },
        { from: 'b', to: 'd', label: 'governs', category: 'governance' },
        { from: 'a', to: 'hub', label: 'identity', category: 'identity' },
        { from: 'c', to: 'hub', label: 'fans in', category: 'interaction' },
        { from: 'd', to: 'hub', label: 'also fans', category: 'interaction' },
      ]);
      const projection = buildC4Shapes(resolved, {});
      inst.getState()._setShapesRaw(projection.shapes);
    }}
  />
);

// ── Scenario: boundary panel ────────────────────────────────────────────────

const BoundaryScenario: FC = () => (
  <CanvasScene
    seed={(inst) => {
      const nodes = [
        rnode('user', 'actor', 'CLI User', 'Outside the boundary.', { x: 0, y: 220 }),
        rnode('sales', 'domain', 'Sales', 'Inside.', { x: 470, y: 80 }),
        rnode('ops', 'domain', 'Operations', 'Inside.', { x: 470, y: 380 }),
        rnode('billing', 'external-system', 'Billing', 'Outside (external).', { x: 900, y: 220 }),
      ];
      const resolved = rdiagram('bound', 'c4-container', 'Boundary', nodes, [
        { from: 'user', to: 'sales', label: 'uses', category: 'interaction', lens: 'both' },
        { from: 'ops', to: 'billing', label: 'invoices via', category: 'identity', lens: 'both' },
      ]);
      const projection = buildC4Shapes(resolved, {
        lens: 'logical',
        boundary: { level: 'container', label: 'Fieldstate Ledger', accent: 'var(--el-system)' },
      });
      inst.getState()._setShapesRaw(projection.shapes);
    }}
  />
);

// ── Scenario: background grid (Background layer via the Canvas prop) ────────

// Exercises `backgroundVariant` (#120's 'grid' acceptance surface): the C4
// facade itself never renders a grid (the April references' dotted grid is
// enterprise APP-SHELL chrome), but @workspec/canvas ships the S2
// Background layer and nothing else goldens it. Rendered through Canvas's
// DEFAULT stack — the only path that reads the prop — so this golden also
// pins the default chrome (zoom controls) around the dot grid.
const GridScenario: FC = () => {
  const instance = useSeededInstance((inst) => {
    const nodes = [
      rnode('a', 'container', 'On The Grid', 'Dots align to the world origin.', { x: 120, y: 120 }),
      rnode('b', 'database', 'Grid Store', null, { x: 620, y: 340 }),
    ];
    const resolved = rdiagram('grid', 'c4-context', 'Grid', nodes, [
      { from: 'a', to: 'b', label: 'reads', category: 'data' },
    ]);
    const projection = buildC4Shapes(resolved, {});
    inst.getState()._setShapesRaw(projection.shapes);
  });
  return (
    <div style={{ position: 'relative', width: 1200, height: 700 }}>
      <CanvasProvider store={instance}>
        <CanvasSpecContext.Provider value={SPEC}>
          <Canvas shortcutScope="none" renderContextMenu={() => null} backgroundVariant="dots" />
        </CanvasSpecContext.Provider>
      </CanvasProvider>
    </div>
  );
};

// ── Full-diagram scenes through the real C4Diagram facade ───────────────────

const FacadeScene: FC<{ resolved: ResolvedDiagram; theme: Theme }> = ({ resolved, theme }) => {
  const [positioned, setPositioned] = useState<PositionedDiagram | null>(null);
  useEffect(() => {
    const view = resolved.view;
    if (!view) return;
    // No `layerSpacing` override — this fixture must lay out exactly the
    // way the dogfood surfaces do, and those now take c4-layout's pinned
    // default (the #120 widening was reverted in #134).
    void layoutDiagram({ nodes: view.nodes, edges: view.edges, layout: null }).then(setPositioned);
  }, [resolved]);
  if (!positioned) return <div data-loading>laying out…</div>;
  return (
    <div style={{ position: 'relative', width: 1200, height: 700 }}>
      <C4Diagram diagram={positioned} resolved={resolved} theme={theme} selectedNodeId="main-system" />
    </div>
  );
};

/** Mirror of the enterprise `final-system-context.png` composition: actors left, system centre, externals right. */
function systemContextFixture(): ResolvedDiagram {
  return rdiagram(
    'context',
    'c4-context',
    'System Context',
    [
      rnode('solo-founder', 'actor', 'Solo Founder', 'Owner-operator. Ships, owns the roadmap.'),
      rnode('product-manager', 'actor', 'Product Manager', 'Shapes scope, validates with users.'),
      rnode('architect', 'actor', 'Architect', 'Designs the system, owns the technical spine.'),
      rnode('main-system', 'system', 'WorkSpec', 'The primary system we are designing.'),
      rnode('github', 'external-system', 'GitHub', 'Source of truth for repos, PRs, issues.'),
      rnode('claude', 'external-system', 'Claude', 'Anthropic API — powers the agent layer.'),
      rnode('stripe', 'external-system', 'Stripe', 'Payments + subscription billing.'),
    ],
    [
      { from: 'solo-founder', to: 'main-system', label: 'uses', category: 'interaction' },
      { from: 'product-manager', to: 'main-system', label: 'shapes scope in', category: 'interaction' },
      { from: 'architect', to: 'main-system', label: 'designs in', category: 'interaction' },
      { from: 'main-system', to: 'github', label: 'commits + PRs', category: 'data' },
      { from: 'main-system', to: 'claude', label: 'agent calls', category: 'identity' },
      { from: 'main-system', to: 'stripe', label: 'billing', category: 'data' },
    ],
  );
}

/** Mirror of the enterprise `verify-05-container-lens.png` composition: Web App → API Server → Postgres. */
function containerLensFixture(): ResolvedDiagram {
  return rdiagram(
    'containers',
    'c4-container(positioned-view)',
    'Container View',
    [
      rnode('web-app', 'container', 'Web App', 'React + Vite SPA.'),
      rnode('api-server', 'container', 'API Server', 'Express + Drizzle.'),
      rnode('postgres', 'database', 'Postgres', 'Primary store.'),
    ],
    [
      { from: 'web-app', to: 'api-server', label: 'REST', category: 'interaction' },
      { from: 'api-server', to: 'postgres', label: 'drizzle-orm', category: 'data' },
    ],
  );
}

// ── Registry ────────────────────────────────────────────────────────────────

export function renderScenario(name: string, theme: Theme): ReactNode {
  switch (name) {
    case 'cards':
      return themedFrame(theme, <CardsScenario />);
    case 'edges':
      return themedFrame(theme, <EdgesScenario />);
    case 'boundary':
      return themedFrame(theme, <BoundaryScenario />);
    case 'grid':
      return themedFrame(theme, <GridScenario />);
    case 'system-context':
      return themedFrame(theme, <FacadeScene resolved={systemContextFixture()} theme={theme} />);
    case 'container-lens':
      return themedFrame(theme, <FacadeScene resolved={containerLensFixture()} theme={theme} />);
    default:
      return <div>unknown scenario: {name}</div>;
  }
}

export const SCENARIOS = ['cards', 'edges', 'boundary', 'grid', 'system-context', 'container-lens'];
