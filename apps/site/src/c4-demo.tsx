// The C4 module's full-page demo (`/c4/demo`) — the live in-browser
// `C4Explorer` over a `MemorySource` seeded with the representative example
// tree (see `c4-seed.ts`). Read-only: `capabilities: { editLayout: false }`,
// no `source` — this is a showcase, not an editor. Split out of `/c4` (Site
// Review UX pass, finding 06 — the demo shells were unequal: Decisions got a
// full-page workbench, C4 got a 640px box embedded in marketing copy) so
// both modules' demos are the same route pattern and the same shell.
//
// Dependency note: the four `@workspec/c4-*` packages are registry pins in
// `dependencies`, same as `@workspec/decision-*` — the temporary workspace
// exception was retired when the c4 family published at v0.1.0-alpha.2 (see
// `docs/c4/drift-log.md` entry 17).
import { useEffect, useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import type { C4Model } from '@workspec/c4-model';
import { C4Explorer, createInertLinkResolver } from '@workspec/c4-ui';
import type { C4StudioHost } from '@workspec/c4-ui';
import '@workspec/c4-ui/styles.css';
import { useTheme } from '@workspec/design';

import { loadDemoModel } from './c4-seed.js';
import { WorkbenchBar } from './demo-bar.js';
import { SiteNav } from './nav.js';

// Same GitHub target C4's own pitch page (c4.tsx) links to — the c4-*
// packages aren't published, so this points at package source, not npm.
const REPO_URL = 'https://github.com/FieldstateNZ/workspec-studio/tree/main/packages';

// The representative example tree's own system title (see
// `examples-c4/.workspec/system/main-system.yaml`) — the workbench bar's
// static crumb names it (Studio redesign, round 3), same as Decisions' crumb
// names the active worked example.
const DEMO_TREE_NAME = 'Fieldstate Ledger';

const host: C4StudioHost = {
  linkResolver: createInertLinkResolver(),
  // Read-only showcase: no `source`, so drag-to-pin never activates even if a
  // future edit accidentally flipped this to `true`.
  capabilities: { editLayout: false },
};

export function C4Demo(): ReactElement {
  // The shell's own Dark/Light preference (Site Review UX pass, finding 03) —
  // never this component's own OS-preference listener.
  const theme = useTheme();
  const [model, setModel] = useState<C4Model | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadDemoModel().then(
      (loaded) => {
        if (!cancelled) setModel(loaded);
      },
      (err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const diagramCount = useMemo(() => model?.diagrams.length ?? 0, [model]);

  return (
    <div className="demo">
      <SiteNav repoUrl={REPO_URL} />
      <WorkbenchBar crumb={<span className="wb-crumb-value">{DEMO_TREE_NAME}</span>} />

      <p className="demo-note" role="note">
        A live <code>C4Explorer</code> running entirely in your browser against a representative
        example tree{diagramCount > 0 ? ` (${diagramCount} diagrams)` : ''} — no install, no signup,
        read-only.{' '}
        <span className="demo-blurb">
          <code>npx @workspec/c4-studio serve</code> gives you the same explorer with drag-to-pin
          over your own repo.
        </span>
      </p>

      {error !== null ? (
        <div className="c4-demo-error" role="alert">
          Could not load the demo tree: {error}
        </div>
      ) : model === null ? (
        <div className="c4-demo-loading">Loading the demo tree…</div>
      ) : (
        <main className="demo-stage">
          {/* The discovery order (alphabetical by filename) puts "container"
              before "system-context" — pin the more natural entry point
              explicitly rather than leave the demo's first impression to
              filename sort order. */}
          <C4Explorer model={model} host={host} theme={theme} initialDiagramSlug="system-context" />
        </main>
      )}
    </div>
  );
}
