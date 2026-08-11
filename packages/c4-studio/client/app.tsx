// The served page (A1 #131 + A2 #132 wiring). Fetches the whole model once
// from the host's `GET /api/model`, mounts `<C4Explorer>` HEADLESS
// (`showHeader={false}` — the owner ruling: a full-bleed canvas with
// floating chrome, like enterprise's `ArchitectureCanvasView`) inside the
// `Shell`, whose on-canvas selector CONTROLS the explorer
// (`selectedDiagramSlug` + `onDiagramChange` keep chip and canvas in
// lock-step).
//
// AUTHORING (A2's client half, installed here — before this the page was
// read-only because nothing mounted it): `onCanvasReady` hands us the live
// `CanvasStoreInstance` per canvas mount, and `installStudioCanvasHost`
// binds the fetch-backed write API onto it. Note the LIFETIME: `C4Explorer`
// remounts its diagram on every diagram/lens switch, so this fires again
// with a FRESH instance each time — we reinstall, never cache.
//
// The browser-side `C4FileSource` (`HttpSource`) is `host.source` with
// `capabilities: { editLayout: true }` — so drag-to-pin is live too:
// dragging a node writes the diagram's `.layout/` file back through
// `PUT /api/file`.
//
// Split out of `main.tsx` so the page is a plain component the client suite
// can render; `main.tsx` is now only the DOM mount + stylesheet imports.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import type { C4Model } from '@workspec/c4-model';
import { C4Explorer, createInertLinkResolver, deriveLevelTabs } from '@workspec/c4-ui';
import type { C4StudioHost, ThemeName } from '@workspec/c4-ui';
import type { CanvasStoreInstance } from '@workspec/canvas';
import { createMutationApi, installStudioCanvasHost } from '../src/client/index.js';
import { fetchModel } from './fetch-model.js';
import { createHttpSource } from './http-source.js';
import type { DiagramCrumbFrame } from './diagram-crumb.js';
import { Shell } from './shell.js';
import type { ShellDiagramItem } from './shell.js';

const source = createHttpSource();
const host: C4StudioHost = {
  source,
  linkResolver: createInertLinkResolver(),
  capabilities: { editLayout: true },
};
const api = createMutationApi();

/** The top-bar nav's entries — `deriveLevelTabs` verbatim, so nav order and level order can never disagree. */
function toNavItems(model: C4Model): readonly ShellDiagramItem[] {
  return deriveLevelTabs(model.diagrams).map((tab) => ({ slug: tab.slug, label: tab.label }));
}

export function App(): ReactElement {
  const [theme, setTheme] = useState<ThemeName>('dark');
  const [model, setModel] = useState<C4Model | null>(null);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [dir, setDir] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [writeError, setWriteError] = useState<string | null>(null);

  // The host's `diagramSlug` is a THUNK, not a value: one host install must
  // keep landing mutations on whatever diagram is showing at gesture time.
  const selectedSlugRef = useRef<string | null>(null);
  selectedSlugRef.current = selectedSlug;

  const loadModel = useCallback(async (): Promise<void> => {
    const loaded = await fetchModel();
    setModel(loaded);
    setSelectedSlug((current) =>
      // Keep the user where they are across a refetch; only pick a default
      // on the first load (or if their diagram has since disappeared).
      current !== null && loaded.diagrams.some((d) => d.slug === current)
        ? current
        : (deriveLevelTabs(loaded.diagrams)[0]?.slug ?? loaded.diagrams[0]?.slug ?? null),
    );
  }, []);

  useEffect(() => {
    loadModel().catch((err: unknown) =>
      setError(err instanceof Error ? err.message : String(err)),
    );
    fetch('/api/health')
      .then((res) => res.json())
      .then((body: { dir?: string }) => setDir(body.dir ?? ''))
      .catch(() => undefined);
  }, [loadModel]);

  /**
   * Installs the studio write host on each freshly mounted canvas. The
   * canvas delete gesture is DIAGRAM-SCOPED by the lead's ruling — it
   * removes the node from THIS diagram (`DELETE /api/diagram-nodes`), never
   * the element file; tree-wide deletion is an explicit A3 action.
   */
  const handleCanvasReady = useCallback(
    (instance: CanvasStoreInstance): void => {
      installStudioCanvasHost(instance, {
        diagramSlug: () => selectedSlugRef.current ?? '',
        api,
        onWriteError: setWriteError,
        onMutated: () => {
          // The reconciliation half of the optimistic edit: re-read the
          // files and re-project. A refetch failure is itself a write-path
          // problem, so it lands in the same banner.
          loadModel().catch((err: unknown) =>
            setWriteError(err instanceof Error ? err.message : String(err)),
          );
        },
        drillDown: (slug) => {
          setSelectedSlug(slug);
        },
        // A3 lands the element editor; until then the canvas's edit
        // affordance is inert rather than throwing.
        openElementEditor: () => undefined,
      });
    },
    [loadModel],
  );

  const diagrams = useMemo(() => (model ? toNavItems(model) : []), [model]);

  // The on-canvas breadcrumb's drill stack. The studio has no drill history
  // yet, so it is the single frame for the diagram on screen — which is
  // exactly what enterprise's crumb renders at stack depth 1. A3's
  // `drillDown` turns this into a real trail; `onCrumb` already navigates
  // to whichever frame is clicked, so it needs no change when it does.
  const crumbStack = useMemo<readonly DiagramCrumbFrame[]>(() => {
    const current = model?.diagrams.find((d) => d.slug === selectedSlug);
    return current ? [{ slug: current.slug, title: current.title, type: current.type }] : [];
  }, [model, selectedSlug]);

  return (
    <Shell
      theme={theme}
      onThemeChange={setTheme}
      dir={dir}
      diagrams={diagrams}
      selectedSlug={selectedSlug}
      onSelectDiagram={setSelectedSlug}
      crumbStack={crumbStack}
      onCrumb={(index) => {
        const frame = crumbStack[index];
        if (frame) setSelectedSlug(frame.slug);
      }}
      writeError={writeError}
      onDismissWriteError={() => setWriteError(null)}
    >
      {error !== null ? (
        <div className="c4sh-error" role="alert">
          Could not reach the host API: {error}
        </div>
      ) : model === null ? (
        <div className="c4sh-empty">Loading the working tree…</div>
      ) : model.diagrams.length === 0 ? (
        <div className="c4sh-empty">
          No diagrams found under <code>.workspec/diagrams/</code>. Author one and reload.
        </div>
      ) : (
        <C4Explorer
          model={model}
          host={host}
          theme={theme}
          selectedDiagramSlug={selectedSlug ?? undefined}
          onDiagramChange={setSelectedSlug}
          onCanvasReady={handleCanvasReady}
          showHeader={false}
          backgroundVariant="dots"
          // No minimap: enterprise does not mount one on the architecture
          // canvas (`ArchitectureCanvasView.tsx:497` calls `<Canvas>` with
          // no `showMinimap`, unlike `ProjectGraphCanvas.tsx:890,893` for
          // its other views). Owner ruling — a PAGE-level decision;
          // `C4Diagram.showMinimap` stays a supported, default-off prop for
          // hosts that do want one.
          showZoomControls
        />
      )}
    </Shell>
  );
}
