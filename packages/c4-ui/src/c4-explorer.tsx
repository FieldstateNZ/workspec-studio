// C4Explorer: a workbench over every diagram in a loaded `C4Model` — a header
// row of segmented C4-level tabs (Context/Container/Component, plus one tab
// per diagram the three-level scheme can't uniquely place) over a canvas +
// detail rail body. Owns navigation state (which diagram, which lens for a
// `c4-container` diagram, which element is selected) and calls
// `@workspec/c4-layout`'s `layoutDiagram` per selection — async, race-guarded
// (a stale in-flight layout from a since-abandoned selection is dropped
// instead of overwriting the current one; see the `generation` ref below),
// never an unawaited floating promise.

import type { CSSProperties, KeyboardEvent, ReactElement } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { C4Model, LoadedElement, ResolvedDiagram } from '@workspec/c4-model';
import { layoutDiagram } from '@workspec/c4-layout';
import type { LayoutDirection, PositionedDiagram, PositionedNode } from '@workspec/c4-layout';
import { labelAwareLayerSpacing } from './c4/index.js';
import { LensToggle } from '@workspec/design/components';
import { PanelRightClose } from 'lucide-react';
import { C4Diagram } from './c4-diagram.js';
import { elementKey } from './element-key.js';
import { createInertLinkResolver } from './host.js';
import type { C4StudioHost } from './host.js';
import { LinksBlock } from './links.js';
import { resolveElementStyle } from './style/spec-defaults.js';
import { ThemedRoot } from './themed-root.js';
import { tooltipContentFor } from './tooltip.js';
import type { ThemeName } from './themes.js';

export interface C4ExplorerProps {
  /** The loaded C4 model — every diagram, element, and the style spec. */
  model: C4Model;
  host?: C4StudioHost | undefined;
  theme?: ThemeName | undefined;
  className?: string | undefined;
  /** Layout flow direction passed through to `layoutDiagram`. Defaults to `'LR'`. */
  direction?: LayoutDirection | undefined;
  /** Initially selected diagram slug. Defaults to the first LEVEL TAB's diagram (the lowest-numbered canonical level present — a multi-diagram model opens on `1 · Context` when a context diagram exists, never `3 · Component`), falling back to `model.diagrams[0]` only for an empty tab set (i.e. an empty model). */
  initialDiagramSlug?: string | undefined;
  /** Show the shared infinite-canvas grid, zoom controls, and minimap. */
  canvasChrome?: boolean | undefined;
  /** Hide the details rail until selection and let the user collapse it. */
  collapsibleDetails?: boolean | undefined;
}

type Lens = 'logical' | 'deployment';

/** One segmented header tab: a label plus the diagram slug it activates. */
interface LevelTab {
  readonly slug: string;
  readonly label: string;
}

/**
 * The three canonical C4 levels this scheme numbers, in level order. A
 * diagram type outside this list (`c4-code`, `sequence`, `er`, `flow`,
 * `deployment`, `custom`, …) never gets a numbered tab — see
 * {@link deriveLevelTabs}.
 */
const LEVEL_DEFS: readonly { readonly type: string; readonly label: string }[] = [
  { type: 'c4-context', label: '1 · Context' },
  { type: 'c4-container', label: '2 · Container' },
  { type: 'c4-component', label: '3 · Component' },
];

/**
 * Builds the header's segmented level tabs from every diagram in the model.
 * A canonical level (`c4-context`/`c4-container`/`c4-component`) gets its
 * numbered label ("1 · Context" etc.) ONLY when the model has EXACTLY ONE
 * diagram of that type — that's the only case where "this tab IS level N"
 * is unambiguous. Everything else (a type outside the three, or a second
 * diagram sharing an already-claimed canonical type) falls back to that
 * diagram's own title as its tab label, appended after the numbered tabs in
 * `model.diagrams` order. Never invents a number for a diagram the scheme
 * can't uniquely place.
 */
function deriveLevelTabs(diagrams: readonly ResolvedDiagram[]): readonly LevelTab[] {
  const byType = new Map<string, ResolvedDiagram[]>();
  for (const diagram of diagrams) {
    const bucket = byType.get(diagram.type);
    if (bucket) bucket.push(diagram);
    else byType.set(diagram.type, [diagram]);
  }

  const tabs: LevelTab[] = [];
  const claimed = new Set<string>();
  for (const { type, label } of LEVEL_DEFS) {
    const bucket = byType.get(type);
    if (bucket && bucket.length === 1) {
      const diagram = bucket[0];
      if (diagram) {
        tabs.push({ slug: diagram.slug, label });
        claimed.add(diagram.slug);
      }
    }
  }
  for (const diagram of diagrams) {
    if (!claimed.has(diagram.slug)) tabs.push({ slug: diagram.slug, label: diagram.title });
  }
  return tabs;
}

/** The drill button's label for a given target diagram — numbered for the three canonical levels, the diagram's own title otherwise. */
function drillLabelFor(diagram: ResolvedDiagram): string {
  switch (diagram.type) {
    case 'c4-context':
      return 'Open context view';
    case 'c4-container':
      return 'Open container view';
    case 'c4-component':
      return 'Open component view';
    default:
      return `Open ${diagram.title}`;
  }
}

function buildElementsByKindAndSlug(model: C4Model): ReadonlyMap<string, LoadedElement> {
  const map = new Map<string, LoadedElement>();
  for (const byKind of Object.values(model.elements)) {
    for (const [slug, element] of byKind) {
      map.set(elementKey(element.element.kind, slug), element);
    }
  }
  return map;
}

export function C4Explorer(props: C4ExplorerProps): ReactElement {
  const {
    model,
    host,
    theme,
    className,
    direction = 'LR',
    initialDiagramSlug,
    canvasChrome = false,
    collapsibleDetails = false,
  } = props;

  // Default selection = the first LEVEL TAB's diagram, not `model.diagrams[0]`:
  // `model.diagrams` is discovery (file) order, so a lexicographic accident
  // could open a multi-diagram model on "3 · Component" while "1 · Context"
  // sits unselected. `deriveLevelTabs` lists every diagram (numbered levels
  // first), so its first entry exists whenever the model has any diagram at
  // all — the `model.diagrams[0]` fallback only matters for an empty model.
  const [selectedSlug, setSelectedSlug] = useState<string | null>(() =>
    initialDiagramSlug && model.diagrams.some((d) => d.slug === initialDiagramSlug)
      ? initialDiagramSlug
      : (deriveLevelTabs(model.diagrams)[0]?.slug ?? model.diagrams[0]?.slug ?? null),
  );
  const [lens, setLens] = useState<Lens>('logical');
  const [positioned, setPositioned] = useState<PositionedDiagram | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The clicked-element rail selection — a `PositionedNode.nodeId` scoped to
  // the CURRENT diagram/lens layout. Cleared on every diagram switch (a
  // node id from diagram A means nothing once diagram B is on screen).
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const selected: ResolvedDiagram | null = useMemo(
    () => model.diagrams.find((d) => d.slug === selectedSlug) ?? null,
    [model, selectedSlug],
  );

  const levelTabs = useMemo(() => deriveLevelTabs(model.diagrams), [model]);
  const elementsByKindAndSlug = useMemo(() => buildElementsByKindAndSlug(model), [model]);
  const linkResolver = useMemo(
    () => host?.linkResolver ?? createInertLinkResolver(),
    [host?.linkResolver],
  );

  // Race-guard: a generation counter, bumped every time the effect's own
  // inputs change. When `layoutDiagram`'s promise resolves, it only applies
  // if it is still the MOST RECENT request — an in-flight layout for a
  // diagram/lens the user has since navigated away from is dropped instead
  // of clobbering the current selection's state.
  const generationRef = useRef(0);

  useEffect(() => {
    const generation = (generationRef.current += 1);
    if (!selected) {
      setPositioned(null);
      setLoading(false);
      setError(null);
      return;
    }

    const view = selected.lensViews ? selected.lensViews[lens] : selected.view;
    if (!view) {
      setPositioned(null);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    // Never show a STALE positioned diagram while a new selection is laying
    // out — a diagram switch clears the pane immediately rather than
    // leaving the previous selection's nodes on screen.
    setPositioned(null);
    layoutDiagram(
      { nodes: view.nodes, edges: view.edges, layout: selected.layout?.data ?? null },
      // Label-aware layer spacing (S4 fix round, #120): guarantee the
      // midpoint label pills fit the inter-layer gap by construction, the
      // way enterprise's dagre ranksep did.
      { direction, layerSpacing: labelAwareLayerSpacing(view.edges) },
    ).then(
      (result) => {
        if (generationRef.current !== generation) return;
        setPositioned(result);
        setLoading(false);
      },
      (layoutError: unknown) => {
        if (generationRef.current !== generation) return;
        setError(layoutError instanceof Error ? layoutError.message : String(layoutError));
        setLoading(false);
      },
    );
  }, [selected, lens, direction]);

  function selectDiagram(slug: string): void {
    if (slug === selectedSlug) return;
    setSelectedSlug(slug);
    setLens('logical');
    setSelectedNodeId(null);
  }

  /**
   * `C4Diagram`'s selection callback: a node click (or Enter on a focused
   * node) populates the rail; a background click, or Escape with focus on
   * the canvas, clears it (`node` is `null` in both those cases). This
   * component deliberately does NOT wire `C4Diagram`'s `onNavigate` (the
   * "click instantly drills down" contract `C4Diagram` still supports for
   * other consumers) — here, drilling only happens via the rail's own
   * button below, so mouse and keyboard users get the exact same two-step
   * flow (select, then explicitly drill) instead of a click doing one thing
   * and Enter doing another.
   */
  function handleSelectNode(node: PositionedNode | null): void {
    setSelectedNodeId(node ? node.nodeId : null);
  }

  /** Escape clears the rail selection regardless of where focus is (canvas or rail) — `C4Diagram` also clears on Escape for its own, narrower case (focus already on the canvas). */
  function handleExplorerKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === 'Escape') setSelectedNodeId(null);
  }

  const selectedNode: PositionedNode | null = useMemo(
    () => positioned?.nodes.find((n) => n.nodeId === selectedNodeId) ?? null,
    [positioned, selectedNodeId],
  );

  const railContent = useMemo(
    () => (selectedNode ? tooltipContentFor(selectedNode, elementsByKindAndSlug) : null),
    [selectedNode, elementsByKindAndSlug],
  );

  const selectedElementStyle = useMemo(
    () => (selectedNode ? resolveElementStyle(selectedNode.kind, model.spec.data) : null),
    [selectedNode, model],
  );

  // The drill target: another diagram (never the one currently showing)
  // whose OWN slug equals the selected node's resolved slug — the SAME
  // slug-matches-a-diagram-slug convention this package has always used
  // for drill-down (see `test-helpers/synthetic-model.ts`), just surfaced
  // as an explicit rail button instead of firing straight off a click.
  // There is no separate "parent diagram" / "scope" field in
  // `@workspec/c4-model` to consult here — this convention (checked, not
  // assumed) IS the model's only drill-down signal today.
  const drillTarget: ResolvedDiagram | null = useMemo(() => {
    if (!selectedNode || selectedNode.slug === null) return null;
    return (
      model.diagrams.find((d) => d.slug === selectedNode.slug && d.slug !== selectedSlug) ?? null
    );
  }, [selectedNode, model, selectedSlug]);

  return (
    <ThemedRoot theme={theme} className={className}>
      <div className="c4-explorer" onKeyDown={handleExplorerKeyDown}>
        <div className="c4-explorer-header">
          <div className="c4-level-tabs" role="group" aria-label="C4 level">
            {levelTabs.map((tab) => (
              <button
                key={tab.slug}
                type="button"
                className={
                  tab.slug === selectedSlug ? 'c4-level-tab c4-level-tab-active' : 'c4-level-tab'
                }
                aria-pressed={tab.slug === selectedSlug}
                onClick={() => selectDiagram(tab.slug)}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <span className="c4-explorer-spacer" />
          <span className="c4-explorer-hint">click an element for details</span>
        </div>

        <div className="c4-explorer-body">
          <div className="c4-explorer-pane">
            {selected?.lensViews && (
              <LensToggle
                value={lens}
                onChange={setLens}
                options={[
                  { value: 'logical', label: 'Logical' },
                  { value: 'deployment', label: 'Deployment' },
                ]}
                size="sm"
              />
            )}
            {error !== null && (
              <div className="c4-explorer-error" role="alert">
                {`Could not lay out this diagram: ${error}`}
              </div>
            )}
            {loading && positioned === null && (
              <div className="c4-explorer-loading">Laying out…</div>
            )}
            {selected && positioned && (
              <C4Diagram
                diagram={positioned}
                resolved={selected}
                spec={model.spec.data}
                host={host}
                selectedNodeId={selectedNodeId}
                onSelect={handleSelectNode}
                elementsByKindAndSlug={elementsByKindAndSlug}
                direction={direction}
                theme={theme}
                canvasChrome={canvasChrome}
              />
            )}
          </div>

          {/* aria-live (not a focus move): selecting a canvas node announces
              the rail's new content to assistive tech while focus stays on
              the node the user just activated. */}
          {(!collapsibleDetails || railContent !== null) && (
            <aside className="c4-detail-rail" aria-label="Element details" aria-live="polite">
              {collapsibleDetails && railContent !== null && (
                <div className="c4-detail-header">
                  <span>Element details</span>
                  <button
                    type="button"
                    className="c4-detail-collapse"
                    aria-label="Collapse element details"
                    onClick={() => setSelectedNodeId(null)}
                  >
                    <PanelRightClose size={16} />
                  </button>
                </div>
              )}
              {!railContent && (
                <div className="c4-detail-empty">
                  <div className="c4-detail-eyebrow">Element details</div>
                  <p className="c4-detail-empty-copy">
                    Select an element on the canvas to inspect it — kind, technology, and the
                    decisions that shaped it.
                  </p>
                </div>
              )}
              {railContent && (
                <>
                  <div
                    className="c4-rail-selected c4-rail-kind"
                    style={{ '--c4-el-accent-raw': selectedElementStyle?.accent } as CSSProperties}
                  >
                    {railContent.kind?.replace(/-/g, ' ') ?? 'element'}
                  </div>
                  <div className="c4-rail-name">{railContent.title}</div>
                  {railContent.description !== null && railContent.description !== '' && (
                    <p className="c4-rail-desc">{railContent.description}</p>
                  )}
                  {railContent.technology !== null && railContent.technology !== '' && (
                    <div className="c4-rail-tech">
                      <span className="c4-rail-tech-label">Tech</span>
                      <span className="c4-rail-tech-value">{railContent.technology}</span>
                    </div>
                  )}
                  <LinksBlock links={railContent.links} resolve={linkResolver} />
                  {drillTarget && (
                    <button
                      type="button"
                      className="c4-rail-drill"
                      onClick={() => selectDiagram(drillTarget.slug)}
                    >
                      {`${drillLabelFor(drillTarget)} →`}
                    </button>
                  )}
                </>
              )}
            </aside>
          )}
        </div>
      </div>
    </ThemedRoot>
  );
}
