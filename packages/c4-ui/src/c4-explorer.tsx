// C4Explorer: left tree nav over every diagram in a loaded `C4Model` + a
// `C4Diagram` pane. Owns navigation state (which diagram, which lens for a
// `c4-container` diagram) and calls `@workspec/c4-layout`'s `layoutDiagram`
// per selection — async, race-guarded (a stale in-flight layout from a
// since-abandoned selection is dropped instead of overwriting the current
// one; see the `generation` ref below), never an unawaited floating promise.

import type { ReactElement } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { C4Model, LoadedElement, ResolvedDiagram } from '@workspec/c4-model';
import { layoutDiagram } from '@workspec/c4-layout';
import type { LayoutDirection, PositionedDiagram } from '@workspec/c4-layout';
import { LensToggle } from '@workspec/design/components';
import { C4Diagram } from './c4-diagram.js';
import { elementKey } from './element-key.js';
import type { C4StudioHost } from './host.js';
import { ThemedRoot } from './themed-root.js';
import type { ThemeName } from './themes.js';

export interface C4ExplorerProps {
  /** The loaded C4 model — every diagram, element, and the style spec. */
  model: C4Model;
  host?: C4StudioHost | undefined;
  theme?: ThemeName | undefined;
  className?: string | undefined;
  /** Layout flow direction passed through to `layoutDiagram`. Defaults to `'LR'`. */
  direction?: LayoutDirection | undefined;
  /** Initially selected diagram slug. Defaults to the first diagram in the model, in the order `C4Model.diagrams` lists them. */
  initialDiagramSlug?: string | undefined;
}

type Lens = 'logical' | 'deployment';

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
  const { model, host, theme, className, direction = 'LR', initialDiagramSlug } = props;

  const [selectedSlug, setSelectedSlug] = useState<string | null>(
    () => (initialDiagramSlug && model.diagrams.some((d) => d.slug === initialDiagramSlug) ? initialDiagramSlug : (model.diagrams[0]?.slug ?? null)),
  );
  const [lens, setLens] = useState<Lens>('logical');
  const [positioned, setPositioned] = useState<PositionedDiagram | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected: ResolvedDiagram | null = useMemo(
    () => model.diagrams.find((d) => d.slug === selectedSlug) ?? null,
    [model, selectedSlug],
  );

  const elementsByKindAndSlug = useMemo(() => buildElementsByKindAndSlug(model), [model]);

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
    layoutDiagram({ nodes: view.nodes, edges: view.edges, layout: selected.layout?.data ?? null }, { direction }).then(
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
  }

  /** `C4Diagram`'s drill-down callback: navigate if — and only if — the clicked slug is another diagram's own slug (the convention this package uses to link an element to its next-level breakdown). A slug with no matching diagram is a no-op, not an error. */
  function handleNavigate(diagramSlug: string): void {
    if (model.diagrams.some((d) => d.slug === diagramSlug)) selectDiagram(diagramSlug);
  }

  return (
    <ThemedRoot theme={theme} className={className}>
      <div className="c4-explorer">
        <nav className="c4-explorer-tree" aria-label="Diagrams">
          <ul>
            {model.diagrams.map((diagram) => (
              <li key={diagram.slug}>
                <button
                  type="button"
                  className={diagram.slug === selectedSlug ? 'c4-tree-item c4-tree-item-active' : 'c4-tree-item'}
                  aria-current={diagram.slug === selectedSlug ? 'true' : undefined}
                  onClick={() => selectDiagram(diagram.slug)}
                >
                  <span className="c4-tree-item-title">{diagram.title}</span>
                  <span className="c4-tree-item-type">{diagram.type}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>
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
          {loading && positioned === null && <div className="c4-explorer-loading">Laying out…</div>}
          {selected && positioned && (
            <C4Diagram
              diagram={positioned}
              resolved={selected}
              spec={model.spec.data}
              host={host}
              onNavigate={handleNavigate}
              elementsByKindAndSlug={elementsByKindAndSlug}
              direction={direction}
              theme={theme}
            />
          )}
        </div>
      </div>
    </ThemedRoot>
  );
}
