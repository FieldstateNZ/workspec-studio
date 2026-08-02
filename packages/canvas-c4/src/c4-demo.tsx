import { useState, type FC } from 'react';
import {
  Canvas,
  CanvasProvider,
  CanvasSpecContext,
  createCanvasStore,
} from '@workspec/canvas';
import type { ResolvedDiagram, ResolvedDiagramNode } from '@workspec/c4-model';
import type { Diagram } from '@workspec/c4-schema';
import { registerC4, buildCanvasSpec } from './register-c4.js';
import { buildC4Shapes, type ProjectionResult } from './project-model.js';
import { C4_NODE_WIDTH } from './shapes/c4-node-shape-util.js';

// The S3 acceptance fixture (#119): one card per element kind — box, pill,
// cylinder, external variant — plus a boundary and categorised edges, at
// fixed positions (sync; the elk path is exercised separately in
// layout tests). Rendered by C4Demo in light or dark; the demo test mounts
// both themes.

function demoNode(
  nodeId: string,
  kind: string,
  title: string,
  description: string | null = null,
): ResolvedDiagramNode {
  return {
    nodeId,
    slug: nodeId,
    kind,
    title,
    description,
    technology: null,
    tags: [],
    position: null,
    injected: false,
    dangling: false,
  };
}

/** A representative resolved container-level diagram (one node per kind). */
export function demoResolvedDiagram(): ResolvedDiagram {
  return {
    slug: 'demo-container',
    path: 'diagrams/demo-container.yaml',
    title: 'Demo container diagram',
    type: 'c4-container',
    description: null,
    raw: {} as Diagram,
    view: {
      nodes: [
        demoNode('cli-user', 'actor', 'CLI User', 'Runs the tooling locally'),
        demoNode('billing', 'external-system', 'Billing Provider', 'Third-party invoicing'),
        demoNode('web-app', 'container', 'Web App', 'React front end'),
        demoNode('api', 'container', 'API', 'Express service'),
        demoNode('events', 'queue', 'Event Bus', 'Async fan-out'),
        demoNode('ledger', 'database', 'Ledger DB', 'Postgres system of record'),
      ],
      edges: [
        { from: 'cli-user', to: 'web-app', label: 'uses', category: 'interaction', lens: 'both', dangling: false },
        { from: 'web-app', to: 'api', label: 'calls', category: 'interaction', lens: 'both', dangling: false },
        { from: 'api', to: 'ledger', label: 'reads/writes', category: 'data', lens: 'both', dangling: false },
        { from: 'api', to: 'events', label: 'publishes', category: 'data', lens: 'both', dangling: false },
        { from: 'api', to: 'billing', label: 'invoices via', category: 'identity', lens: 'both', dangling: false },
      ],
    },
    lensViews: null,
    layout: null,
  };
}

/** Fixed demo positions (LR bands: actor | containers+infra | external). */
const DEMO_POSITIONS: Record<string, { x: number; y: number }> = {
  'cli-user': { x: 0, y: 200 },
  'web-app': { x: 460, y: 60 },
  api: { x: 460, y: 340 },
  events: { x: 900, y: 480 },
  ledger: { x: 900, y: 200 },
  billing: { x: 1340, y: 340 },
};

/** The projected demo shapes (deployment lens so the infra kinds show). */
export function demoProjection(): ProjectionResult {
  return buildC4Shapes(demoResolvedDiagram(), {
    lens: 'deployment',
    positions: DEMO_POSITIONS,
    drillableSlugs: new Set(['web-app', 'api']),
    boundary: { level: 'container', label: 'Demo System', accent: 'var(--el-system)' },
  });
}

/** Props for {@link C4Demo}. */
export interface C4DemoProps {
  theme?: 'light' | 'dark';
}

/**
 * The C4 fixture story: full canvas + the demo projection under the given
 * theme. Mount full-bleed (position:relative parent) with
 * `@workspec/canvas/styles.css` + `@workspec/canvas-c4/styles.css` loaded.
 */
export const C4Demo: FC<C4DemoProps> = ({ theme = 'light' }) => {
  const [instance] = useState(() => {
    const inst = createCanvasStore();
    registerC4(inst);
    const projection = demoProjection();
    inst.getState()._setShapesRaw(projection.shapes);
    return inst;
  });
  const [spec] = useState(() => buildCanvasSpec(undefined));
  return (
    <div data-theme={theme} style={{ position: 'absolute', inset: 0 }}>
      <CanvasProvider store={instance}>
        <CanvasSpecContext.Provider value={spec}>
          <Canvas backgroundVariant="dots" />
        </CanvasSpecContext.Provider>
      </CanvasProvider>
    </div>
  );
};

export { C4_NODE_WIDTH as DEMO_NODE_WIDTH };
