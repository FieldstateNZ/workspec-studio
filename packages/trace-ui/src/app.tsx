// `TraceApp` — the shell: the persistent meters bar + a view switch
// (Requirements | Matrix | Feature detail; Run review still renders as a
// DISABLED tab — spec §8 lands it in T7 — so the nav's shape doesn't change
// again when it arrives). Fetches the current `TraceModel` through the
// host's repository (`useTraceModel`, see `context.tsx`) and hands it down
// to the pure views as a prop — `TraceApp` itself is the only component in
// this package that touches the host. Must be rendered inside a
// `<TraceStudioProvider host={…} theme={…}>` (mirrors `@workspec/cost-ui`'s
// `CostApp`, always used inside `CostStudioProvider`).
//
// Uses `@workspec/design/components`' `Tabs` for the view switcher, mirroring
// `CostApp`'s own choice of the same component for its four-view nav.
import { useState } from 'react';
import type { ReactElement } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@workspec/design/components';
import { useTraceModel } from './context.js';
import { FeatureDetail } from './feature-detail.js';
import { MatrixView } from './matrix-view.js';
import { MetersBar } from './meters-bar.js';
import { RequirementsExplorer } from './requirements-explorer.js';

/** The views `TraceApp` can switch between today. */
export type TraceView = 'requirements' | 'matrix' | 'feature';

const VIEWS: readonly TraceView[] = ['requirements', 'matrix', 'feature'];

function isTraceView(value: string): value is TraceView {
  return (VIEWS as readonly string[]).includes(value);
}

const VIEW_LABEL: Record<TraceView, string> = {
  requirements: 'Requirements',
  matrix: 'Matrix',
  feature: 'Feature detail',
};

/** The nav's own per-view hint (design §5's `nav.hint`) — distinct from `RequirementsExplorer`'s own "click a row for its chain" hint, which lives inside that view, not duplicated here. */
const VIEW_HINT: Record<TraceView, string> = {
  requirements: 'the graph as a table — diagnostics flagged',
  matrix: 'the RTM — scenario rows grouped by Rule → Feature',
  feature: "one feature's chain — Rules, scenarios, and proof",
};

/** Props for {@link TraceApp}. */
export interface TraceAppProps {
  /** Which view to show first. Defaults to `requirements`. */
  initialView?: TraceView | undefined;
}

/** The Traceability Workbench shell: topbar + meters bar + view switch. */
export function TraceApp(props: TraceAppProps): ReactElement {
  const { initialView = 'requirements' } = props;
  const [view, setView] = useState<TraceView>(initialView);
  const [featureSlug, setFeatureSlug] = useState<string | undefined>(undefined);
  const modelQuery = useTraceModel();
  const model = modelQuery.data;

  return (
    <div className="trace-app">
      <div className="trace-topbar">
        <span className="trace-topbar-glyph" aria-hidden="true" />
        <span className="trace-topbar-brand">workspec-trace</span>
        <span className="trace-topbar-slash">/ traceability</span>
        {model?.latestRun !== undefined && model.latestRun !== null && (
          <span className="trace-topbar-emitter">{`emitter ▸ ${model.latestRun.emitter}`}</span>
        )}
        <span className="trace-topbar-spacer" />
        {model !== undefined && (
          <span className="trace-topbar-counts">
            {`${model.features.length} features · ${model.systemRequirements.length} sysreqs · ${model.scenarios.length} scenarios`}
          </span>
        )}
      </div>

      {modelQuery.isPending && <div className="trace-notice">Loading traceability model…</div>}
      {modelQuery.isError && (
        <div className="trace-notice trace-notice-error">
          {`Could not load the traceability model: ${modelQuery.error?.message ?? 'unknown error'}`}
        </div>
      )}

      {model !== undefined && (
        <>
          <MetersBar model={model} />

          <Tabs
            value={view}
            onValueChange={(next) => {
              if (isTraceView(next)) setView(next);
            }}
          >
            <div className="trace-nav">
              <TabsList className="trace-nav-list" aria-label="Traceability views">
                {VIEWS.map((v) => (
                  <TabsTrigger key={v} value={v} className="trace-nav-trigger">
                    {VIEW_LABEL[v]}
                  </TabsTrigger>
                ))}
                <TabsTrigger
                  value="run-review"
                  className="trace-nav-trigger"
                  disabled
                  title="Run review lands in T7 (#75)"
                >
                  Run review
                </TabsTrigger>
              </TabsList>
              <span className="trace-nav-hint">{VIEW_HINT[view]}</span>
            </div>

            <div className="trace-view">
              <TabsContent value="requirements">
                <RequirementsExplorer model={model} />
              </TabsContent>
              <TabsContent value="matrix">
                <MatrixView model={model} />
              </TabsContent>
              <TabsContent value="feature">
                <FeatureDetail
                  model={model}
                  featureSlug={featureSlug}
                  onFeatureChange={setFeatureSlug}
                />
              </TabsContent>
            </div>
          </Tabs>
        </>
      )}
    </div>
  );
}
