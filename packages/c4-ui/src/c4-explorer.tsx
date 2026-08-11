// C4Explorer: a workbench over every diagram in a loaded `C4Model` — a header
// row of segmented C4-level tabs (Context/Container/Component, plus one tab
// per diagram the three-level scheme can't uniquely place) over a full-bleed
// canvas with enterprise-shaped floating chrome: the lens pills overlay the
// canvas top-left and the element detail rail is a dismissible overlay panel
// that appears ON selection (A1, #131 — it is no longer a permanent layout
// column squeezing the canvas). Owns navigation state (which diagram —
// optionally host-controlled via `selectedDiagramSlug`, which lens for a
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
import type { BackgroundVariant, CanvasStoreInstance } from '@workspec/canvas';
import { LensToggle } from '@workspec/design/components';
import { C4Diagram } from './c4-diagram.js';
import { deriveLevelTabs } from './derive-level-tabs.js';
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
  /**
   * Controlled diagram selection (A1, #131 — the c4-studio sidebar's
   * diagrams list drives the explorer). When set, THIS prop is the selected
   * diagram: internal navigation (level tabs, the rail's drill button)
   * raises {@link C4ExplorerProps.onDiagramChange} and waits for the host
   * to reflect the new slug back, exactly like a controlled input. A slug
   * matching no diagram in the model selects nothing (empty canvas) — the
   * host owns the value, the explorer never second-guesses it. Omit for the
   * uncontrolled behaviour every pre-A1 consumer has.
   */
  selectedDiagramSlug?: string | undefined;
  /** Called with the target slug on every internal navigation (level tab click, rail drill button) — fired in BOTH controlled and uncontrolled modes, so hosts can mirror selection (sidebar highlight) without controlling it. */
  onDiagramChange?: ((slug: string) => void) | undefined;
  /** Grid style passed through to {@link C4Diagram} (the enterprise dotted canvas). Omitted = no grid — pre-A1 render. */
  backgroundVariant?: BackgroundVariant | undefined;
  /** Mount the shared Minimap on the canvas (passthrough to {@link C4Diagram}). Defaults to false. */
  showMinimap?: boolean | undefined;
  /** Mount the shared zoom controls on the canvas (passthrough to {@link C4Diagram}). Defaults to false. */
  showZoomControls?: boolean | undefined;
  /**
   * Instance-exposure passthrough to {@link C4Diagram} (A1 review, for
   * A2/A3 host installation). The explorer REMOUNTS its diagram on every
   * VIEW SWITCH (diagram, lens, or direction), so this fires again with a
   * fresh `CanvasStoreInstance` after each switch — reinstall there. It
   * does NOT fire again for a mere `model` REFRESH: same view, new data
   * keeps the same instance (and the user's camera), so a host installed
   * on the first mount stays live across every edit-then-reload cycle. See
   * the prop's full contract on `C4DiagramProps.onCanvasReady`.
   */
  onCanvasReady?: ((instance: CanvasStoreInstance) => void) | undefined;
  /**
   * Render the workbench header bar (level tabs + crumb + hint). Defaults
   * to true — the explorer every pre-A1 consumer mounts. A host
   * reproducing the enterprise C4 architecture page (owner ruling, A1
   * review round: full-bleed canvas with ON-CANVAS floating navigation,
   * per enterprise `ArchitectureCanvasView` + `C4Toolbar`) passes false
   * and supplies its own diagram navigation, driving the explorer through
   * `selectedDiagramSlug`/`onDiagramChange`.
   */
  showHeader?: boolean | undefined;
}

type Lens = 'logical' | 'deployment';

/**
 * One `layoutDiagram` result together with the VIEW it belongs to — the
 * `${slug}|${lens}|${direction}` key built in {@link C4Explorer}. Paired in
 * a single state value so the rendered canvas is always keyed on the view
 * its own nodes came from, never on a selection whose layout has not landed
 * yet.
 */
interface LaidOutView {
  readonly key: string;
  readonly diagram: PositionedDiagram;
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
    selectedDiagramSlug,
    onDiagramChange,
    backgroundVariant,
    showMinimap = false,
    showZoomControls = false,
    onCanvasReady,
    showHeader = true,
  } = props;

  // Default selection = the first LEVEL TAB's diagram, not `model.diagrams[0]`:
  // `model.diagrams` is discovery (file) order, so a lexicographic accident
  // could open a multi-diagram model on "3 · Component" while "1 · Context"
  // sits unselected. `deriveLevelTabs` lists every diagram (numbered levels
  // first), so its first entry exists whenever the model has any diagram at
  // all — the `model.diagrams[0]` fallback only matters for an empty model.
  const [internalSlug, setInternalSlug] = useState<string | null>(() =>
    initialDiagramSlug && model.diagrams.some((d) => d.slug === initialDiagramSlug)
      ? initialDiagramSlug
      : (deriveLevelTabs(model.diagrams)[0]?.slug ?? model.diagrams[0]?.slug ?? null),
  );
  // Controlled vs uncontrolled: a provided `selectedDiagramSlug` IS the
  // selection (matching no diagram = nothing selected); otherwise the
  // internal state above navigates as it always has.
  const controlled = selectedDiagramSlug !== undefined;
  const selectedSlug: string | null = controlled
    ? model.diagrams.some((d) => d.slug === selectedDiagramSlug)
      ? selectedDiagramSlug
      : null
    : internalSlug;
  const [lens, setLens] = useState<Lens>('logical');
  // The laid-out view CURRENTLY ON SCREEN, tagged with the `viewKey` it was
  // produced for. One state, not two: the tag has to move with the nodes,
  // or the canvas could be keyed on a view its nodes don't belong to for a
  // render (which would remount it — the exact thing the tag exists to
  // prevent). `null` = nothing laid out yet, so nothing is rendered.
  const [laidOut, setLaidOut] = useState<LaidOutView | null>(null);
  const positioned = laidOut?.diagram ?? null;
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

  // The VIEW identity: which diagram, which lens, which flow direction —
  // everything a user would call "navigating somewhere else". A change here
  // is a genuine VIEW SWITCH (clear the pane, remount the canvas, re-fit the
  // camera). Everything ELSE that re-runs the layout below is a DATA
  // REFRESH: most importantly a post-edit model reload, which mints a brand
  // new `C4Model` (and so a new `selected` `ResolvedDiagram`) even when the
  // content is byte-identical. Pre-A2 the effect could not tell the two
  // apart, so every mutation cleared `positioned`, unmounted `C4Diagram`,
  // minted a fresh `CanvasStoreInstance`, and dumped the user's zoom/pan —
  // tolerable for a viewer, not for an editor (place a node and the viewport
  // jumps away from where you dropped it).
  const viewKey = `${selectedSlug ?? ''}|${lens}|${direction}`;
  const prevViewKeyRef = useRef(viewKey);

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
    const viewChanged = prevViewKeyRef.current !== viewKey;
    prevViewKeyRef.current = viewKey;
    if (!selected) {
      setLaidOut(null);
      setLoading(false);
      setError(null);
      return;
    }

    const view = selected.lensViews ? selected.lensViews[lens] : selected.view;
    if (!view) {
      setLaidOut(null);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    // Never show a STALE positioned diagram while a new SELECTION is laying
    // out — a view switch clears the pane immediately rather than leaving
    // the previous selection's nodes on screen. A data refresh is the
    // opposite case: the diagram on screen is still the right one, so it
    // stays mounted (no blank frame, no camera reset, no fresh canvas
    // instance) and the new layout swaps in when it resolves. The
    // `generationRef` guard below is what keeps that swap safe.
    if (viewChanged) setLaidOut(null);
    layoutDiagram(
      { nodes: view.nodes, edges: view.edges, layout: selected.layout?.data ?? null },
      // No `layerSpacing` override — @workspec/c4-layout's pinned default
      // applies. The #120 label-aware widening was reverted in #134: it
      // reserved an empty corridor that cost 72% bbox width and made pill
      // crowding worse. See the note at the top of c4/layout.ts.
      { direction },
    ).then(
      (result) => {
        if (generationRef.current !== generation) return;
        setLaidOut({ key: viewKey, diagram: result });
        setLoading(false);
      },
      (layoutError: unknown) => {
        if (generationRef.current !== generation) return;
        setError(layoutError instanceof Error ? layoutError.message : String(layoutError));
        setLoading(false);
      },
    );
  }, [selected, lens, direction, viewKey]);

  function selectDiagram(slug: string): void {
    if (slug === selectedSlug) return;
    if (!controlled) setInternalSlug(slug);
    onDiagramChange?.(slug);
  }

  // The ONE per-diagram reset path: lens and rail selection clear when the
  // selected slug ACTUALLY changes — never on a mere navigation attempt.
  // In controlled mode `selectDiagram` only raises `onDiagramChange`; a
  // host that declines (doesn't reflect the slug back) must leave the
  // current lens + open rail untouched (A1 review fix: the old synchronous
  // resets in `selectDiagram` wiped both on declined navigation).
  const prevSlugRef = useRef(selectedSlug);
  useEffect(() => {
    if (prevSlugRef.current === selectedSlug) return;
    prevSlugRef.current = selectedSlug;
    setLens('logical');
    setSelectedNodeId(null);
  }, [selectedSlug]);

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
        {showHeader && (
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
            <span className="c4-crumb">{`diagrams ▸ ${selected?.slug ?? '—'}`}</span>
            <span className="c4-explorer-spacer" />
            <span className="c4-explorer-hint">click an element for details</span>
          </div>
        )}

        <div className="c4-explorer-body">
          <div className="c4-explorer-pane">
            {error !== null && (
              <div className="c4-explorer-error" role="alert">
                {`Could not lay out this diagram: ${error}`}
              </div>
            )}
            {loading && positioned === null && (
              <div className="c4-explorer-loading">Laying out…</div>
            )}
            {selected && laidOut && (
              <C4Diagram
                // The remount seam, made EXPLICIT — and note it keys on the
                // laid-out view's OWN key, not the live `viewKey`, so the
                // frame between "user clicked another diagram" and "its
                // layout landed" doesn't mint (and instantly discard) a
                // canvas. A view switch changes the key: React remounts,
                // a fresh `CanvasStoreInstance` is minted, the camera
                // re-fits, `onCanvasReady` fires again. A DATA REFRESH
                // keeps it: React keeps the element, the instance, any
                // host installed on it, and the user's camera.
                key={laidOut.key}
                cameraFitKey={laidOut.key}
                diagram={laidOut.diagram}
                resolved={selected}
                spec={model.spec.data}
                host={host}
                selectedNodeId={selectedNodeId}
                onSelect={handleSelectNode}
                elementsByKindAndSlug={elementsByKindAndSlug}
                direction={direction}
                theme={theme}
                backgroundVariant={backgroundVariant}
                showMinimap={showMinimap}
                showZoomControls={showZoomControls}
                onCanvasReady={onCanvasReady}
              />
            )}
            {/* The lens pills float over the canvas top-left (enterprise
                container-lens chrome, verify-05) instead of consuming a
                layout row above it. */}
            {selected?.lensViews && (
              <div className="c4-lens-overlay">
                <LensToggle
                  value={lens}
                  onChange={setLens}
                  options={[
                    { value: 'logical', label: 'Logical' },
                    { value: 'deployment', label: 'Deployment' },
                  ]}
                  size="sm"
                />
              </div>
            )}
          </div>

          {/* The dismissible detail overlay (A1, #131): mounts ON selection,
              floats over the canvas right edge, never reserves a layout
              column. aria-live (not a focus move): a selection change
              announces the panel's new content to assistive tech while
              focus stays on the node the user just activated. */}
          {railContent && (
            <aside className="c4-detail-rail" aria-label="Element details" aria-live="polite">
              <button
                type="button"
                className="c4-rail-close"
                aria-label="Close details"
                onClick={() => setSelectedNodeId(null)}
              >
                ×
              </button>
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
            </aside>
          )}
        </div>
      </div>
    </ThemedRoot>
  );
}
